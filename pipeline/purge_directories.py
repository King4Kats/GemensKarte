"""Purge des liens "annuaire" servis comme site web (DB pur, zéro réseau) -> retrait + trace

Certains domaines (mappy, cerfapp...) sont des ANNUAIRES / cartes, pas le vrai site d'une
asso. Quand ils se sont glissés dans la couche servie à l'affichage, on les retire :
  - colonne curée `website` (PRIORITAIRE à la lecture) -> NULLifiée si c'est un annuaire ;
  - `social.website` (couche secondaire) -> clé retirée si c'est un annuaire.

La vraie prévention est dans lib_match.DIRECTORY_HOSTS (discover ne les reproposera plus) ;
ce script nettoie juste l'existant. Trace append-only dans meta.directoryRemoved. Idempotent.

Usage:
  python purge_directories.py [--limit N] [--dept 85] [--dry-run]
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone

import psycopg

from lib_match import host_of

# Domaines à purger de la couche servie. Doit rester un sous-ensemble de DIRECTORY_HOSTS.
BAD_HOSTS = {"mappy.com", "mappy.fr", "cerfapp.fr", "cerfapp.com"}

DSN = os.environ.get(
    "DATABASE_URL", "postgres://gemenskarte:gemenskarte@localhost:5433/gemenskarte"
)


def is_bad(url: str | None) -> bool:
    """True si l'URL pointe vers un domaine annuaire (host exact ou sous-domaine)."""
    if not url:
        return False
    h = host_of(url)
    return any(h == b or h.endswith("." + b) for b in BAD_HOSTS)


def fetch_pending(conn, limit, dept):
    # Pré-filtre SQL large (ILIKE sur les motifs) puis vérification stricte du host en Python.
    like = " OR ".join(
        [f"website ILIKE %(p{i})s" for i in range(len(BAD_HOSTS))]
        + [f"social->>'website' ILIKE %(p{i})s" for i in range(len(BAD_HOSTS))]
    )
    params = {f"p{i}": f"%{h}%" for i, h in enumerate(sorted(BAD_HOSTS))}
    conds = [f"({like})"]
    if dept:
        conds.append("department = %(dept)s")
        params["dept"] = dept
    where = " AND ".join(conds)
    lim = "" if limit is None else f"LIMIT {int(limit)}"
    rows = conn.execute(
        f"""SELECT id, name, website, social,
                   coalesce(meta->'directoryRemoved', '[]'::jsonb)
            FROM associations
            WHERE {where} ORDER BY id {lim}""",
        params,
    ).fetchall()
    return [{"id": str(r[0]), "name": r[1], "website": r[2],
             "social": r[3] or {}, "dirRemoved": r[4] or []} for r in rows]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--dept", default=None)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    with psycopg.connect(DSN, autocommit=False) as conn:
        batch = fetch_pending(conn, args.limit, args.dept)
        total = len(batch)
        print(f"Purge annuaires : {total} fiches candidates "
              f"(hosts={sorted(BAD_HOSTS)}, dry-run={args.dry_run}).", flush=True)

        n_col = n_soc = 0
        ts = datetime.now(timezone.utc).isoformat(timespec="seconds")
        for asso in batch:
            social = dict(asso["social"])
            website = asso["website"]
            removed = []

            if is_bad(website):
                removed.append({"platform": "website", "layer": "column", "url": website})
                website = None
                n_col += 1
            if is_bad(social.get("website")):
                removed.append({"platform": "website", "layer": "social", "url": social["website"]})
                social.pop("website", None)
                n_soc += 1

            if not removed:
                continue

            new_dir = asso["dirRemoved"] + [{**r, "reason": "annuaire (pas un site)", "at": ts}
                                            for r in removed]
            if not args.dry_run:
                conn.execute(
                    """UPDATE associations
                       SET website = %s,
                           social = %s::jsonb,
                           meta = jsonb_set(meta, '{directoryRemoved}', %s::jsonb)
                       WHERE id = %s""",
                    (website, json.dumps(social), json.dumps(new_dir), asso["id"]),
                )
                conn.commit()

            tags = ",".join(f"{r['platform']}/{r['layer']}" for r in removed)
            print(f"  {asso['name'][:40]:40} retiré: {tags}", flush=True)

        print(f"\nPurge finie : {total} fiches | colonne website={n_col} social.website={n_soc}",
              flush=True)
    return 0


if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
    sys.exit(main())
