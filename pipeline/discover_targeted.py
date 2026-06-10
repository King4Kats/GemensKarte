"""Passe de découverte CIBLÉE par plateforme — comble les trous de la découverte générale.

Le souci : discover.py ne fait qu'UNE recherche DDG générale ("<nom> <ville> association
Vendée", top 10) et n'attrape une page Facebook/Instagram/HelloAsso/site que si elle figure
dans ce top 10. Résultat : plein de pages existent mais ne sont jamais découvertes (Facebook
3 %, Instagram 0,7 %).

Ici on fait une recherche DÉDIÉE par plateforme, par exemple :
  - facebook  : site:facebook.com "<nom>" <ville>
  - instagram : site:instagram.com "<nom>" <ville>
  - helloasso : <nom> <ville> site:helloasso.com
  - website   : "<nom>" <ville> Vendée   (site officiel, pour combler les trous)

Pour chaque asso SANS candidat sur cette plateforme, on lance la recherche, on extrait le(s)
meilleur(s) candidat(s) et on les AJOUTE dans meta.discovery (socialCandidates ou
websiteCandidates), exactement au même format que discover.py. Ensuite les candidats repassent
TOUT SEULS dans le flux déjà calibré verify_llm -> apply (on ne touche pas à ces deux scripts).

⚠ PIÈGE IMPORTANT (verify_llm) : verify_llm.py saute une asso dès que
meta.verification.model existe. Donc si on ajoute un candidat à une asso DÉJÀ vérifiée, elle ne
serait jamais re-jugée. Solution : quand on ajoute vraiment un candidat, on EFFACE le marqueur
meta.verification.model dans le même UPDATE -> la boucle verify du superviseur la reprend.

⚠ PRÉCISION > RAPPEL : mieux vaut une fiche vide qu'une fiche fausse.
  - facebook / instagram : on reste permissif à la découverte, c'est le LLM (sur titre+snippet)
    qui tranche ensuite -> pas de risque de faux lien.
  - website : pareil, le LLM télécharge la page et juge.
  - helloasso : ATTENTION, verify_llm fait confiance AVEUGLÉMENT à HelloAsso (trusted, conf 1.0,
    sans juger titre/snippet). Donc ici l'extraction doit rester STRICTE -> on réutilise
    find_helloasso() de helloasso.py (garde anti-token-étranger), jamais classify().

Idempotent : un marqueur par plateforme dans meta (fbTargetedAt / igTargetedAt /
helloassoCheckedAt / webTargetedAt) évite de re-chercher une asso déjà traitée (sauf --redo).
Reprenable : commit par ligne. Doux sur DDG : --sleep + petits --limit (réutilise le backoff
de discover.py).

Usage:
  python discover_targeted.py --platform facebook|instagram|helloasso|website
                              [--limit N] [--dept 85] [--redo] [--dry-run] [--sleep 1.5]

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

from discover import search_with_retry
from lib_match import classify, normalize_social
from helloasso import find_helloasso

DSN = os.environ.get(
    "DATABASE_URL", "postgres://gemenskarte:gemenskarte@localhost:5433/gemenskarte"
)

# Config par plateforme :
#   col    = clé dans la colonne `social` ET nom de plateforme (sert au filtre "sans candidat")
#   marker = marqueur d'idempotence posé dans meta (timestamp ISO)
#   kind   = "social" -> meta.discovery.socialCandidates ; "website" -> websiteCandidates
# HelloAsso réutilise le marqueur historique (helloassoCheckedAt) pour ne pas re-scanner ce que
# l'ancienne passe helloasso.py a déjà fait.
PLATFORMS = {
    "facebook":  {"col": "facebook",  "marker": "fbTargetedAt",       "kind": "social"},
    "instagram": {"col": "instagram", "marker": "igTargetedAt",       "kind": "social"},
    "helloasso": {"col": "helloasso", "marker": "helloassoCheckedAt", "kind": "social"},
    "website":   {"col": "website",   "marker": "webTargetedAt",      "kind": "website"},
}

# On n'ajoute pas 15 candidats sociaux d'un coup : ça ferait juger le LLM 15 fois pour rien.
# Les premiers (mieux classés DDG / meilleur match_type) suffisent largement.
MAX_NEW_SOCIAL = 3


def build_query(platform: str, asso: dict) -> str:
    """Construit la requête DDG ciblée selon la plateforme."""
    name = asso["name"]
    city = asso.get("city") or ""
    if platform == "facebook":
        return f'site:facebook.com "{name}" {city}'
    if platform == "instagram":
        return f'site:instagram.com "{name}" {city}'
    if platform == "helloasso":
        # Même format que helloasso.py (déjà éprouvé) : nom + ville + site:helloasso.com.
        return f"{name} {city} site:helloasso.com"
    # website : on cible le site officiel. Les guillemets autour du nom = plus précis.
    return f'"{name}" {city} Vendée'


def extract_candidates(platform: str, asso: dict, results: list[dict]) -> list[dict]:
    """Extrait les candidats de la plateforme voulue, au format attendu par verify_llm/apply.

    On RÉUTILISE classify() (de lib_match) pour facebook/instagram/website : le match_type vient
    gratuitement, exactement comme discover.py. Pour helloasso on reste STRICT (find_helloasso).
    """
    if platform == "helloasso":
        # find_helloasso renvoie une URL (ou None) seulement si le slug matche fort le nom et
        # qu'aucun token "étranger" distinctif ne traîne -> sûr pour l'auto-trust de verify_llm.
        url = find_helloasso(asso, results)
        if not url:
            return []
        norm = normalize_social("helloasso", url) or {"slug": ""}
        # On forge un candidat au même format que classify() pour rester homogène.
        return [{
            "platform": "helloasso", "url": url, "slug": norm["slug"],
            "match_type": "slug", "rank": 1, "title": "", "snippet": "",
        }]

    # facebook / instagram / website : classify trie le bon grain de l'ivraie (rejets
    # structurels, annuaires, faux positifs) et pose un match_type par candidat.
    res = classify(asso, results)
    if platform == "website":
        return res["websiteCandidates"]
    # facebook ou instagram : on garde uniquement la plateforme demandée.
    return [c for c in res["socialCandidates"] if c["platform"] == platform][:MAX_NEW_SOCIAL]


def fetch_pending(conn, platform, limit, dept, redo):
    """Sélectionne les assos SANS candidat sur cette plateforme et pas encore traitées.

    Garde-fou NULL : la colonne `social` peut être NULL (asso sans aucun lien = justement notre
    cible !). `social ? 'x'` sur NULL vaut NULL et exclurait la ligne -> on COALESCE en '{}'.
    """
    cfg = PLATFORMS[platform]
    params: dict = {"col": cfg["col"]}
    conds = [
        "location IS NOT NULL",
        # Pas déjà un lien appliqué pour cette plateforme.
        "NOT (COALESCE(social,'{}'::jsonb) ? %(col)s)",
    ]
    if cfg["kind"] == "social":
        # Pas déjà un candidat de cette plateforme dans la découverte.
        conds.append(
            "NOT (COALESCE(meta->'discovery'->'socialCandidates','[]'::jsonb) "
            "@> %(plat_json)s::jsonb)"
        )
        params["plat_json"] = json.dumps([{"platform": platform}])
    # else (website) : aucune condition en plus. On vise toutes les assos SANS site VALIDÉ
    # (déjà couvert par "NOT social ? 'website'" ci-dessus). Le critère "zéro candidat" était
    # trop restrictif : discover.py remonte presque toujours un site bidon, donc la liste de
    # candidats est rarement vide -> la passe ne trouvait jamais personne. Ici on relance une
    # recherche site officiel dédiée ; les NOUVELLES urls (dédoublonnées) repassent par le LLM
    # qui télécharge + juge la page -> aucun faux site (précision garantie).
    if not redo:
        # Idempotence : on saute celles déjà passées par CETTE passe ciblée.
        conds.append("(meta ? %(marker)s) IS NOT TRUE")
        params["marker"] = cfg["marker"]
    if dept:
        conds.append("department = %(dept)s")
        params["dept"] = dept

    where = " AND ".join(conds)
    lim = "" if limit is None else f"LIMIT {int(limit)}"
    rows = conn.execute(
        f"""SELECT id, name, city, department, meta->'discovery'
            FROM associations
            WHERE {where}
            ORDER BY id {lim}""",
        params,
    ).fetchall()
    # r[4] = meta.discovery (psycopg3 le renvoie déjà en dict Python), ou None si absent.
    return [
        {"id": str(r[0]), "name": r[1], "city": r[2], "department": r[3], "discovery": r[4]}
        for r in rows
    ]


def merge_into_discovery(discovery, kind, new_cands):
    """Fusionne les nouveaux candidats dans la découverte existante. Renvoie (disc, n_ajoutes).

    On dédoublonne par url (idempotence inter-passes : relancer ne crée pas de doublon). Pour le
    website on re-trie par score et on garde le top 5, comme discover.py.
    """
    disc = dict(discovery) if discovery else {}
    field = "socialCandidates" if kind == "social" else "websiteCandidates"
    existing = list(disc.get(field, []))
    seen = {c.get("url") for c in existing}
    ajoutes = [c for c in new_cands if c.get("url") and c["url"] not in seen]
    if not ajoutes:
        return disc, 0

    merged = existing + ajoutes
    if kind == "website":
        # Même tri que classify/discover : meilleur score d'abord, puis meilleur rang. Cap 5.
        merged.sort(key=lambda c: (c.get("score", 0), -c.get("rank", 99)), reverse=True)
        merged = merged[:5]
    disc[field] = merged
    return disc, len(ajoutes)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--platform", required=True, choices=sorted(PLATFORMS.keys()))
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--dept", default=None, help="filtrer un département (ex: 85)")
    ap.add_argument("--redo", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--sleep", type=float, default=1.5)
    args = ap.parse_args()

    platform = args.platform
    cfg = PLATFORMS[platform]
    marker = cfg["marker"]
    kind = cfg["kind"]

    with psycopg.connect(DSN, autocommit=False) as conn:
        batch = fetch_pending(conn, platform, args.limit, args.dept, args.redo)
        total = len(batch)
        print(
            f"Découverte ciblée [{platform}] — à chercher : {total} assos "
            f"(dry-run={args.dry_run}).",
            flush=True,
        )

        n_found = n_err = 0
        for i, asso in enumerate(batch, 1):
            ts = datetime.now(timezone.utc).isoformat(timespec="seconds")
            try:
                query = build_query(platform, asso)
                results = search_with_retry(query)
                cands = extract_candidates(platform, asso, results)
            except Exception as exc:
                n_err += 1
                print(f"  [{i}/{total}] {asso['name'][:36]:36} ERR {type(exc).__name__}", flush=True)
                continue

            disc, n_add = merge_into_discovery(asso.get("discovery"), kind, cands)

            if not args.dry_run:
                if n_add:
                    # On a ajouté un/des candidat(s) : on réécrit meta.discovery, on pose le
                    # marqueur, et on EFFACE meta.verification.model pour que la boucle verify
                    # reprenne l'asso (sinon elle resterait bloquée comme "déjà vérifiée").
                    conn.execute(
                        """UPDATE associations
                           SET meta = (jsonb_set(COALESCE(meta,'{}'::jsonb),
                                                 '{discovery}', %s::jsonb, true)
                                       || %s::jsonb) #- '{verification,model}'
                           WHERE id = %s""",
                        (json.dumps(disc), json.dumps({marker: ts}), asso["id"]),
                    )
                else:
                    # Rien trouvé : on pose juste le marqueur pour ne pas re-chercher demain.
                    conn.execute(
                        "UPDATE associations SET meta = COALESCE(meta,'{}'::jsonb) || %s::jsonb WHERE id = %s",
                        (json.dumps({marker: ts}), asso["id"]),
                    )
                conn.commit()

            if n_add:
                n_found += 1
            tag = f"+{n_add} candidat(s)" if n_add else "—"
            print(f"  [{i}/{total}] {asso['name'][:36]:36} {tag}", flush=True)
            time.sleep(args.sleep + random.uniform(0, 0.6))

        print(
            f"\nDécouverte ciblée [{platform}] finie : {total} assos | "
            f"avec nouveau candidat: {n_found} | erreurs: {n_err}",
            flush=True,
        )
    return 0


if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
    sys.exit(main())
