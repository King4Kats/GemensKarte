"""SCRAP 2 — Vérification LLM (Ollama local) -> meta.verification

Pour chaque asso ayant un meta.discovery, juge chaque candidat :
  - réseaux sociaux (FB/IG/LI/TikTok/Twitter) : Ollama juge titre+snippet+slug (pages bloquées) ;
  - site web : httpx récupère la page -> Trafilatura extrait le texte (repli readability) -> Ollama juge ;
  - HelloAsso : AUTO-FIABLE (plateforme à slug vérifié), pas d'appel LLM.

Sortie par candidat : {url, confidence 0-1, verdict: keep|quarantine|drop, reason}.
Écrit dans meta.verification (n'applique RIEN dans `social` : c'est le rôle de SCRAP 4).

Idempotent (saute si meta.verification présent sauf --redo). Reprenable (commit par ligne).

Usage:
  python verify_llm.py [--limit N] [--dept 85] [--redo] [--dry-run] [--max-sites 2] [--model qwen3.5:27b]
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from datetime import datetime, timezone

import httpx
import psycopg
from ollama import Client
import trafilatura
from readability import Document

DSN = os.environ.get(
    "DATABASE_URL", "postgres://gemenskarte:gemenskarte@localhost:5433/gemenskarte"
)
OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "http://localhost:11434")
DEFAULT_MODEL = os.environ.get("VERIFY_MODEL", "qwen3.5:27b")

_TAGS = re.compile(r"<[^>]+>")
_WS = re.compile(r"\s+")

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " \
     "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"

VERDICTS = {"keep", "quarantine", "drop"}

SYSTEM = (
    "Tu es un vérificateur strict de liens d'associations françaises. "
    "On te donne une association (nom, ville, description) et un lien trouvé sur le web. "
    "Ta tâche : déterminer si ce lien appartient VRAIMENT à CETTE association précise. "
    "Méfie-toi : page d'une VILLE ou d'un lieu, profil d'une PERSONNE physique, "
    "page d'une AUTRE association homonyme, organisme NATIONAL, annuaire, article de presse. "
    "Réponds STRICTEMENT en JSON: "
    '{"confidence": <0..1>, "verdict": "keep"|"quarantine"|"drop", "reason": "<court, en français>"}. '
    "keep = certain que c'est bien cette asso ; quarantine = plausible mais doute ; "
    "drop = ce n'est pas cette asso (personne, ville, autre orga)."
)


def ollama_judge(client: Client, model: str, payload: str) -> dict:
    resp = client.generate(
        model=model, system=SYSTEM, prompt=payload, format="json",
        options={"temperature": 0, "num_predict": 200}, stream=False,
    )
    raw = (resp.get("response") or "").strip()
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", raw, re.DOTALL)
        data = json.loads(m.group(0)) if m else {}
    verdict = str(data.get("verdict", "")).lower().strip()
    if verdict not in VERDICTS:
        verdict = "quarantine"
    try:
        conf = max(0.0, min(1.0, float(data.get("confidence", 0))))
    except (TypeError, ValueError):
        conf = 0.0
    reason = str(data.get("reason", ""))[:240]
    return {"confidence": conf, "verdict": verdict, "reason": reason}


def asso_block(asso: dict) -> str:
    desc = (asso.get("description") or "").strip()
    desc = (desc[:500] + "…") if len(desc) > 500 else desc
    return (f"ASSOCIATION:\n  nom: {asso['name']}\n  ville: {asso.get('city') or '?'}"
            f" ({asso.get('department') or '?'})\n  description: {desc or '(aucune)'}\n")


def judge_social(client, model, asso, cand) -> dict:
    payload = (
        asso_block(asso) +
        f"\nLIEN TROUVÉ (réseau social, page non scrapable) :\n"
        f"  plateforme: {cand['platform']}\n  identifiant: {cand.get('slug')}\n"
        f"  url: {cand['url']}\n  titre du résultat: {cand.get('title')}\n"
        f"  extrait: {cand.get('snippet')}\n"
        f"  (indice de matching automatique: {cand.get('match_type')})\n"
        f"\nCe {cand['platform']} appartient-il à CETTE association ?"
    )
    out = ollama_judge(client, model, payload)
    out["url"] = cand["url"]
    return out


def fetch_text(url: str) -> tuple[str | None, str | None]:
    """Retourne (texte, erreur). texte tronqué à ~4000 chars.

    Extraction principale via Trafilatura : il vire bien mieux le boilerplate
    (menus, pubs, pieds de page) que readability -> texte plus propre = meilleur
    jugement du LLM. readability sert de repli (si Trafilatura ne sort rien) et
    fournit le titre court."""
    try:
        with httpx.Client(follow_redirects=True, timeout=8.0,
                          headers={"User-Agent": UA}) as c:
            r = c.get(url)
            r.raise_for_status()
            ctype = r.headers.get("content-type", "")
            if "html" not in ctype and "text" not in ctype:
                return None, f"non-html ({ctype})"
            html = r.text
            # 1) Trafilatura renvoie déjà du texte nettoyé (pas de HTML à re-stripper).
            body = trafilatura.extract(
                html, include_comments=False, include_tables=False, favor_recall=True,
            ) or ""
            doc = Document(html)  # pour le titre, et repli si Trafilatura est vide
            if not body:
                body = _TAGS.sub(" ", doc.summary())
            body = _WS.sub(" ", body).strip()
            head = f"{doc.short_title()} — " if doc.short_title() else ""
            text = (head + body)[:4000]
            return (text or None), (None if text else "page vide")
    except httpx.HTTPStatusError as e:
        return None, f"HTTP {e.response.status_code}"
    except Exception as e:
        return None, f"{type(e).__name__}"


def judge_website(client, model, asso, cand) -> dict:
    text, err = fetch_text(cand["url"])
    if not text:
        # page inaccessible : on ne peut pas confirmer -> quarantaine prudente.
        return {"url": cand["url"], "confidence": 0.2, "verdict": "quarantine",
                "reason": f"page inaccessible ({err})", "fetchError": err}
    payload = (
        asso_block(asso) +
        f"\nSITE WEB CANDIDAT :\n  url: {cand['url']}\n"
        f"  CONTENU RÉEL DE LA PAGE:\n  \"\"\"{text}\"\"\"\n"
        f"\nCe site est-il le site officiel/principal de CETTE association "
        f"(et pas un annuaire, une mairie, une autre orga) ?"
    )
    out = ollama_judge(client, model, payload)
    out["url"] = cand["url"]
    return out


def verify_one(client, model, asso, disc, max_sites) -> dict:
    results: dict[str, dict] = {}
    # --- réseaux sociaux
    for cand in disc.get("socialCandidates", []):
        plat = cand["platform"]
        if plat == "helloasso":
            results[plat] = {"url": cand["url"], "confidence": 1.0, "verdict": "keep",
                             "reason": "HelloAsso (plateforme fiable, slug vérifié)", "trusted": True}
            continue
        if plat in results and results[plat]["verdict"] == "keep":
            continue  # déjà un keep pour cette plateforme
        results[plat] = judge_social(client, model, asso, cand)
    # --- sites web : on ne dépense du LLM que sur les candidats PLAUSIBLES.
    # score=1 (name_in_domain=0, juste la ville/un token de titre) = bruit communal quasi-certain
    # -> on ne fetch même pas (gain de temps massif, aucune perte de qualité).
    sites = [
        c for c in disc.get("websiteCandidates", [])
        if c.get("score", 0) >= 2 or c.get("name_in_domain", 0) >= 1
    ][:max_sites]
    best = None
    for cand in sites:
        v = judge_website(client, model, asso, cand)
        if best is None or v["confidence"] > best["confidence"]:
            best = v
        if v["verdict"] == "keep" and v["confidence"] >= 0.7:
            break  # un bon site suffit
    if best is not None:
        results["website"] = best
    return {
        "ts": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "model": model,
        "results": results,
    }


def fetch_pending(conn, limit, dept, redo):
    conds = ["(meta -> 'discovery') IS NOT NULL"]
    if not redo:
        # On (re)vérifie tant que NOTRE marqueur (verification.model) est absent :
        # ça inclut les fiches portant une verification LEGACY (sans 'model').
        conds.append("(meta -> 'verification' ->> 'model') IS NULL")
    if dept:
        conds.append("department = %(dept)s")
    where = " AND ".join(conds)
    lim = "" if limit is None else f"LIMIT {int(limit)}"
    rows = conn.execute(
        f"""SELECT id, name, city, department, description, meta->'discovery'
            FROM associations WHERE {where} ORDER BY id {lim}""",
        {"dept": dept},
    ).fetchall()
    return [{"id": str(r[0]), "name": r[1], "city": r[2], "department": r[3],
             "description": r[4], "discovery": r[5]} for r in rows]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--dept", default=None)
    ap.add_argument("--redo", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--max-sites", type=int, default=2)
    ap.add_argument("--model", default=DEFAULT_MODEL)
    args = ap.parse_args()

    client = Client(host=OLLAMA_HOST)
    with psycopg.connect(DSN, autocommit=False) as conn:
        batch = fetch_pending(conn, args.limit, args.dept, args.redo)
        total = len(batch)
        print(f"SCRAP 2 — à vérifier : {total} assos | modèle {args.model} "
              f"(dry-run={args.dry_run}).", flush=True)

        n_keep = n_quar = n_drop = n_err = 0
        for i, asso in enumerate(batch, 1):
            t0 = time.time()
            disc = asso.pop("discovery") or {}
            try:
                ver = verify_one(client, args.model, asso, disc, args.max_sites)
            except Exception as exc:
                n_err += 1
                print(f"  [{i}/{total}] {asso['name'][:34]:34} ERR {type(exc).__name__}: {exc}", flush=True)
                continue

            for r in ver["results"].values():
                n_keep += r["verdict"] == "keep"
                n_quar += r["verdict"] == "quarantine"
                n_drop += r["verdict"] == "drop"

            if not args.dry_run:
                conn.execute(
                    "UPDATE associations SET meta = meta || %s::jsonb WHERE id = %s",
                    (json.dumps({"verification": ver, "verifiedAt": ver["ts"]}), asso["id"]),
                )
                conn.commit()

            summary = " ".join(
                f"{k}={v['verdict'][0]}{v['confidence']:.1f}" for k, v in ver["results"].items()
            ) or "(aucun candidat)"
            print(f"  [{i}/{total}] {asso['name'][:34]:34} {time.time()-t0:5.1f}s  {summary}", flush=True)

        print(f"\nSCRAP 2 fini : {total} assos | keep={n_keep} quarantine={n_quar} "
              f"drop={n_drop} | erreurs={n_err}", flush=True)
    return 0


if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
    sys.exit(main())
