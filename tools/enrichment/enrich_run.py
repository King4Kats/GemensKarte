"""Passe B — run industriel. Parcourt les associations, cherche site + réseaux
sociaux (enrich_lite), et écrit en base :
  - réseaux sociaux haute confiance (HelloAsso/Facebook/Instagram/LinkedIn) → colonne `social`
    (sans écraser une valeur déjà présente) ;
  - candidat `website` + mentions + listes mairie/comcom → `meta.enrichment` (file de relecture,
    PAS appliqué automatiquement) ;
  - `meta.enrichedAt` = horodatage → reprise idempotente (on saute les déjà traités).

Usage:
  python enrich_run.py [--limit N] [--redo] [--dry-run] [--sleep 1.0]
  (sans --limit : traite TOUT le reste ; reprenable, relançable sans risque.)
"""

import argparse
import json
import random
import sys
import time
from datetime import datetime, timezone

import psycopg
from ddgs.exceptions import DDGSException, RatelimitException, TimeoutException

from enrich_lite import classify, search

import os

DSN = os.environ.get(
    "DATABASE_URL", "postgres://gemenskarte:gemenskarte@localhost:5432/gemenskarte"
)

# Plateformes appliquées automatiquement à la colonne `social`.
AUTO_PLATFORMS = {"facebook", "instagram", "helloasso", "linkedin"}


def search_with_retry(query: str, max_tries: int = 4) -> list[dict]:
    delay = 5.0
    for attempt in range(1, max_tries + 1):
        try:
            return search(query)
        except RatelimitException:
            if attempt == max_tries:
                raise
            wait = delay * attempt + random.uniform(0, 3)
            print(f"      …rate-limit, pause {wait:.0f}s", flush=True)
            time.sleep(wait)
        except (TimeoutException, DDGSException):
            if attempt == max_tries:
                raise
            time.sleep(2.0 * attempt)
    return []


def process_one(asso: dict) -> dict:
    res = classify(asso, search_with_retry(f"{asso['name']} {asso.get('city') or ''} association Vendée"))
    socials_detail = res.get("socials_detail", {})
    # auto-apply : tout ce qui a passé le filtre "strong" sur une plateforme connue
    social_patch = {
        p: d["url"] for p, d in socials_detail.items() if p in AUTO_PLATFORMS
    }
    enrichment = {
        "ts": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "socials": socials_detail,
        "websiteCandidate": res.get("website"),
        "websiteScore": res.get("website_score", 0),
        "mentions": res.get("mentions", []),
        "mairieListings": res.get("mairie_listings", []),
    }
    return {"social_patch": social_patch, "enrichment": enrichment}


def fetch_pending(conn, limit, redo):
    cond = "" if redo else "AND (meta ? 'enrichedAt') IS NOT TRUE"
    lim = "" if limit is None else f"LIMIT {int(limit)}"
    rows = conn.execute(
        f"""SELECT id, name, city, postal_code, department
            FROM associations
            WHERE location IS NOT NULL {cond}
            ORDER BY id {lim}"""
    ).fetchall()
    return [{"id": str(r[0]), "name": r[1], "city": r[2], "postalCode": r[3], "department": r[4]} for r in rows]


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--redo", action="store_true", help="re-traiter même les déjà enrichis")
    ap.add_argument("--dry-run", action="store_true", help="n'écrit rien en base")
    ap.add_argument("--sleep", type=float, default=1.0, help="pause polie entre requêtes (s)")
    args = ap.parse_args()

    with psycopg.connect(DSN, autocommit=False) as conn:
        batch = fetch_pending(conn, args.limit, args.redo)
        total = len(batch)
        print(f"À traiter : {total} associations (dry-run={args.dry_run}).", flush=True)

        n_social = n_site = n_mairie = n_err = 0
        for i, asso in enumerate(batch, 1):
            t0 = time.time()
            try:
                out = process_one(asso)
            except Exception as exc:
                n_err += 1
                print(f"  [{i}/{total}] {asso['name'][:36]:36} ERR {type(exc).__name__}: {exc}", flush=True)
                continue

            sp = out["social_patch"]
            enr = out["enrichment"]
            if sp:
                n_social += 1
            if enr["websiteCandidate"]:
                n_site += 1
            if enr["mairieListings"]:
                n_mairie += 1

            if not args.dry_run:
                # social existant prioritaire (patch || social) ; meta fusionné.
                conn.execute(
                    """UPDATE associations
                       SET social = %s::jsonb || social,
                           meta = meta || %s::jsonb
                       WHERE id = %s""",
                    (
                        json.dumps(sp),
                        json.dumps({"enrichment": enr, "enrichedAt": enr["ts"]}),
                        asso["id"],
                    ),
                )
                conn.commit()  # commit par ligne → reprise sûre

            dt = time.time() - t0
            print(
                f"  [{i}/{total}] {asso['name'][:36]:36} {dt:4.1f}s  "
                f"social={','.join(sp) or '-':<28} "
                f"site={'?' if enr['websiteCandidate'] else '-'} "
                f"mairie={len(enr['mairieListings'])}",
                flush=True,
            )
            time.sleep(args.sleep + random.uniform(0, 0.6))

        print(
            f"\nFini : {total} traitées | avec réseaux: {n_social} | "
            f"candidat site: {n_site} | lien mairie: {n_mairie} | erreurs: {n_err}",
            flush=True,
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
