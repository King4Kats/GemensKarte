"""SCRAP 6 — Reaper des liens morts confirmés (DB pur, zéro réseau) -> retrait + trace

Retire les liens dont liveness.py a confirmé la MORT (status=dead, >=2 échecs consécutifs)
de la couche SERVIE à l'affichage :
  - colonne curée `website` (PRIORITAIRE à la lecture, jamais reconstruite par apply) ;
  - `social.website` (couche secondaire) ;
  - `social.helloasso` (rare : page asso supprimée -> 404).

Cohérence avec apply.py (qui RECONSTRUIT social depuis verification) :
  - colonne `website` : apply n'y touche jamais -> retrait définitif ici, aucun conflit.
  - social.website : si l'asso est (re)vérifié plus tard, la gate linkHealth d'apply
    retire à nouveau le lien mort -> les deux convergent, pas de clobber.

On ne retire QUE l'URL effectivement servie et confirmée morte (linkHealth.<plat>.url) :
  - si la colonne `website` == url morte -> on NULLifie la colonne (le social.website
    éventuel redevient l'url servie et sera vérifié au prochain passage liveness) ;
  - sinon si social.website == url morte -> on retire la clé de social.

Trace append-only dans meta.deadRemoved (jamais écrasée par apply). Idempotent : après
retrait l'URL ne matche plus -> la fiche n'est plus sélectionnée.

Usage:
  python reap_dead.py [--limit N] [--dept 85] [--dry-run] [--min-fails 2]
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone

import psycopg

DEFINITIVE = {"404", "410"}  # morts certains -> retrait immédiat, sans attendre


def reapable(rec: dict, min_fails: int, min_age_hours: int, now: datetime) -> bool:
    """Un lien est retirable s'il est mort, confirmé >=min_fails, ET soit définitif (404/410),
    soit en panne depuis >= min_age_hours (anti-panne-passagère)."""
    if rec.get("status") != "dead":
        return False
    if int(rec.get("consecutiveFailures", 0)) < min_fails:
        return False
    if str(rec.get("httpCode")) in DEFINITIVE:
        return True
    first = rec.get("firstFailAt")
    if not first:
        return False
    try:
        age_h = (now - datetime.fromisoformat(first)).total_seconds() / 3600
    except (ValueError, TypeError):
        return False
    return age_h >= min_age_hours

DSN = os.environ.get(
    "DATABASE_URL", "postgres://gemenskarte:gemenskarte@localhost:5433/gemenskarte"
)


def fetch_pending(conn, limit, dept, min_fails):
    # Fiches dont au moins un lien servi (website col / social.website / social.helloasso)
    # est confirmé mort sur SON url courante.
    H = "meta->'linkHealth'"
    cond_dead = (
        f"(({H}->'website'->>'status'='dead' "
        f"  AND ({H}->'website'->>'consecutiveFailures')::int >= %(mf)s "
        f"  AND (website = {H}->'website'->>'url' OR social->>'website' = {H}->'website'->>'url')) "
        f" OR ({H}->'helloasso'->>'status'='dead' "
        f"  AND ({H}->'helloasso'->>'consecutiveFailures')::int >= %(mf)s "
        f"  AND social->>'helloasso' = {H}->'helloasso'->>'url'))"
    )
    conds = ["meta ? 'linkHealth'", cond_dead]
    if dept:
        conds.append("department = %(dept)s")
    where = " AND ".join(conds)
    lim = "" if limit is None else f"LIMIT {int(limit)}"
    rows = conn.execute(
        f"""SELECT id, name, website, social, {H},
                   coalesce(meta->'deadRemoved', '[]'::jsonb)
            FROM associations
            WHERE {where} ORDER BY id {lim}""",
        {"dept": dept, "mf": min_fails},
    ).fetchall()
    return [{"id": str(r[0]), "name": r[1], "website": r[2], "social": r[3] or {},
             "lh": r[4] or {}, "deadRemoved": r[5] or []} for r in rows]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--dept", default=None)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--min-fails", type=int, default=2)
    ap.add_argument("--min-age-hours", type=int, default=12,
                    help="panne mini avant retrait (sauf 404/410, retirés tout de suite)")
    args = ap.parse_args()

    with psycopg.connect(DSN, autocommit=False) as conn:
        batch = fetch_pending(conn, args.limit, args.dept, args.min_fails)
        total = len(batch)
        print(f"SCRAP 6 — reaper : {total} fiches avec lien mort confirmé "
              f"(min-fails={args.min_fails}, dry-run={args.dry_run}).", flush=True)

        n_col = n_soc_web = n_soc_ha = 0
        now = datetime.now(timezone.utc)
        ts = now.isoformat(timespec="seconds")
        for asso in batch:
            lh = asso["lh"]
            social = dict(asso["social"])
            website = asso["website"]
            removed = []

            wh = lh.get("website") or {}
            if reapable(wh, args.min_fails, args.min_age_hours, now):
                dead_url = wh.get("url")
                if website and website == dead_url:
                    website = None
                    removed.append({"platform": "website", "layer": "column", "url": dead_url})
                    n_col += 1
                elif social.get("website") == dead_url:
                    social.pop("website", None)
                    removed.append({"platform": "website", "layer": "social", "url": dead_url})
                    n_soc_web += 1

            ha = lh.get("helloasso") or {}
            if reapable(ha, args.min_fails, args.min_age_hours, now) and social.get("helloasso") == ha.get("url"):
                social.pop("helloasso", None)
                removed.append({"platform": "helloasso", "layer": "social", "url": ha.get("url")})
                n_soc_ha += 1

            if not removed:
                continue

            new_dead = asso["deadRemoved"] + [{**r, "reason": "lien mort confirmé (HTTP)",
                                               "httpCode": (lh.get(r["platform"]) or {}).get("httpCode"),
                                               "at": ts} for r in removed]
            if not args.dry_run:
                conn.execute(
                    """UPDATE associations
                       SET website = %s,
                           social = %s::jsonb,
                           meta = jsonb_set(meta, '{deadRemoved}', %s::jsonb)
                       WHERE id = %s""",
                    (website, json.dumps(social), json.dumps(new_dead), asso["id"]),
                )
                conn.commit()

            tags = ",".join(f"{r['platform']}/{r['layer']}" for r in removed)
            print(f"  {asso['name'][:40]:40} retiré: {tags}", flush=True)

        print(f"\nSCRAP 6 fini : {total} fiches | colonne website={n_col} "
              f"social.website={n_soc_web} social.helloasso={n_soc_ha}", flush=True)
    return 0


if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
    sys.exit(main())
