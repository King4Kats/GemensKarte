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

from lib_match import classify

DSN = os.environ.get(
    "DATABASE_URL", "postgres://gemenskarte:gemenskarte@localhost:5433/gemenskarte"
)


def search(query: str, max_results: int = 10) -> list[dict]:
    with DDGS() as ddgs:
        return list(ddgs.text(query, region="fr-fr", max_results=max_results))


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


def discover_one(asso: dict) -> dict:
    query = f"{asso['name']} {asso.get('city') or ''} association Vendée"
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
