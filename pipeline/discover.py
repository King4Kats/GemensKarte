"""SCRAP 1 — Découverte (DuckDuckGo) -> meta.discovery

Régénère les candidats (réseaux sociaux + site web + listes mairie + mentions) pour
chaque association, AVEC titre + snippet, et SANS toucher la colonne `social`.

Idempotent : saute les assos qui ont déjà un meta.discovery (sauf --redo).
Reprenable : commit par ligne.

Usage:
  python discover.py [--limit N] [--offset N] [--dept 85] [--redo] [--dry-run] [--sleep 1.5]

Env: DATABASE_URL (défaut: tunnel local postgres://gemenskarte:gemenskarte@localhost:5433/gemenskarte)
"""

from __future__ import annotations

import argparse
import json
import os
import random
import sys
import time
from datetime import datetime, timezone

import psycopg
from ddgs import DDGS
from ddgs.exceptions import DDGSException, RatelimitException, TimeoutException

from departements import nom_departement
from lib_match import classify

DSN = os.environ.get(
    "DATABASE_URL", "postgres://gemenskarte:gemenskarte@localhost:5433/gemenskarte"
)


# Moteurs de recherche et proxy de sortie pilotes par variables d'environnement,
# positionnees par le superviseur (une combinaison distincte par passe) pour ne pas
# saturer un meme (moteur x IP). Aucune info d'infra n'est codee en dur ici :
#   GK_DDGS_BACKEND = liste de moteurs separes par des virgules (rotation au retry)
#   GK_DDGS_PROXY   = proxy SOCKS/HTTP optionnel (sortie par une autre IP), sinon vide
_BACKENDS = [b.strip() for b in os.environ.get("GK_DDGS_BACKEND", "auto").split(",") if b.strip()] or ["auto"]
_PROXY = os.environ.get("GK_DDGS_PROXY", "").strip() or None
# Timeout HTTP : plus large derriere un proxy (latence SSH/SOCKS). Sinon une requete lente
# expire et est rejouee 4x -> requetes gaspillees (et ce flot de retries peut ressembler a
# de l'abus cote moteur). Surchargeable via GK_DDGS_TIMEOUT.
_TIMEOUT = int(os.environ.get("GK_DDGS_TIMEOUT", "20" if _PROXY else "10"))


# Cooldown moteur : si un moteur renvoie un rate-limit, on l'EVITE pendant GK_DDGS_COOLDOWN
# secondes (au lieu de le marteler) et on bascule sur le suivant de la liste. L'etat est
# par-processus (chaque lot relance python), ce qui suffit : un lot fait des centaines de
# requetes, et la pause inter-lots fait office de reset.
_COOLDOWN = int(os.environ.get("GK_DDGS_COOLDOWN", "180"))
_blocked: dict[str, float] = {}  # moteur -> instant (epoch) jusqu'auquel on l'evite


def _pick_backend(attempt: int) -> str:
    """Rotation a partir de `attempt`, en sautant les moteurs en cooldown."""
    now = time.time()
    n = len(_BACKENDS)
    for i in range(n):
        be = _BACKENDS[(attempt + i) % n]
        if _blocked.get(be, 0.0) <= now:
            return be
    # tous en cooldown -> celui dont le cooldown expire le plus tot
    return min(_BACKENDS, key=lambda b: _blocked.get(b, 0.0))


def search(query: str, max_results: int = 10, backend: str | None = None, attempt: int = 0) -> list[dict]:
    if backend is None:
        backend = _pick_backend(attempt)
    ddgs_kwargs = {"timeout": _TIMEOUT}
    if _PROXY:
        ddgs_kwargs["proxy"] = _PROXY
    with DDGS(**ddgs_kwargs) as ddgs:
        return list(ddgs.text(query, region="fr-fr", backend=backend, max_results=max_results))


# Message EXACT levé par ddgs quand le moteur a bien répondu mais sans aucun résultat (aucune
# erreur de moteur). Une vraie panne remonte, elle, l'erreur du moteur ou un TimeoutException.
_NO_RESULTS = "No results found."


def search_with_retry(query: str, max_tries: int = 4) -> list[dict]:
    """Recherche avec rotation des moteurs. Renvoie [] si DEUX moteurs différents ont répondu
    « aucun résultat » : la fiche peut alors être marquée « cherchée, rien trouvé ».

    Avant le 12/10/2026, ce cas levait une exception comme une panne : la fiche n'était jamais
    marquée et restait en tête de chaque lot (résidus qui bloquaient un département, ex. les
    58 fiches « site web » de la Vendée). On n'accepte pas le vide d'UN seul moteur (un moteur
    qui bloque en silence peut renvoyer une page vide) : il en faut deux, distincts.
    """
    delay = 5.0
    empty: set[str] = set()  # moteurs qui ont répondu « aucun résultat »
    for attempt in range(1, max_tries + 1):
        backend = _pick_backend(attempt - 1)
        try:
            return search(query, backend=backend)
        except DDGSException as exc:  # RatelimitException et TimeoutException en héritent
            if str(exc) == _NO_RESULTS and not isinstance(exc, (RatelimitException, TimeoutException)):
                empty.add(backend)
                if len(empty) >= 2:
                    return []
                if attempt == max_tries:
                    raise
                time.sleep(1.0)
                continue
            if isinstance(exc, RatelimitException):
                _blocked[backend] = time.time() + _COOLDOWN  # met CE moteur au repos
                print(f"      …rate-limit {backend}, cooldown {_COOLDOWN}s + bascule moteur", flush=True)
                if attempt == max_tries:
                    raise
                time.sleep(delay + random.uniform(0, 3))
                continue
            if attempt == max_tries:
                raise
            time.sleep(2.0 * attempt)
    return []


def discover_one(asso: dict) -> dict:
    # Nom du département réel (avant le 12/10/2026 : « Vendée » en dur pour toute la France).
    query = " ".join(p for p in (asso["name"], asso.get("city") or "", "association",
                                 nom_departement(asso.get("department"))) if p)
    results = search_with_retry(query)
    res = classify(asso, results)
    return {
        "ts": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "query": query,
        "nResults": len(results),
        "socialCandidates": res["socialCandidates"],
        "websiteCandidates": res["websiteCandidates"],
        "mairieListings": res["mairieListings"],
        "mentions": res["mentions"],
    }


def fetch_pending(conn, limit, offset, dept, redo):
    conds = ["location IS NOT NULL"]
    if not redo:
        conds.append("(meta -> 'discovery') IS NULL")
    if dept:
        conds.append("department = %(dept)s")
    where = " AND ".join(conds)
    lim = "" if limit is None else f"LIMIT {int(limit)}"
    off = f"OFFSET {int(offset)}" if offset else ""
    rows = conn.execute(
        f"""SELECT id, name, city, department
            FROM associations
            WHERE {where}
            ORDER BY id {lim} {off}""",
        {"dept": dept},
    ).fetchall()
    return [{"id": str(r[0]), "name": r[1], "city": r[2], "department": r[3]} for r in rows]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--offset", type=int, default=0)
    ap.add_argument("--dept", default=None, help="filtrer un département (ex: 85)")
    ap.add_argument("--redo", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--sleep", type=float, default=1.5)
    args = ap.parse_args()

    with psycopg.connect(DSN, autocommit=False) as conn:
        batch = fetch_pending(conn, args.limit, args.offset, args.dept, args.redo)
        total = len(batch)
        print(f"SCRAP 1 — à découvrir : {total} assos (dry-run={args.dry_run}).", flush=True)

        n_soc = n_site = n_err = 0
        for i, asso in enumerate(batch, 1):
            t0 = time.time()
            try:
                disc = discover_one(asso)
            except Exception as exc:
                n_err += 1
                print(f"  [{i}/{total}] {asso['name'][:36]:36} ERR {type(exc).__name__}: {exc}", flush=True)
                continue

            ns = len(disc["socialCandidates"])
            has_site = bool(disc["websiteCandidates"])
            if ns:
                n_soc += 1
            if has_site:
                n_site += 1

            if not args.dry_run:
                conn.execute(
                    """UPDATE associations
                       SET meta = meta || %s::jsonb
                       WHERE id = %s""",
                    (json.dumps({"discovery": disc, "discoveryAt": disc["ts"]}), asso["id"]),
                )
                conn.commit()

            plats = ",".join(sorted({c["platform"] for c in disc["socialCandidates"]})) or "-"
            print(
                f"  [{i}/{total}] {asso['name'][:36]:36} {time.time()-t0:4.1f}s  "
                f"social[{ns}]={plats:<24} site={'?' if has_site else '-'}",
                flush=True,
            )
            time.sleep(args.sleep + random.uniform(0, 0.6))

        print(f"\nSCRAP 1 fini : {total} | avec candidat social: {n_soc} | "
              f"avec candidat site: {n_site} | erreurs: {n_err}", flush=True)
    return 0


if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
    sys.exit(main())
