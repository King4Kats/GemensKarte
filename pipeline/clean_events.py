"""Nettoyage DB direct des événements DÉJÀ stockés : retire le bruit (recrutement France
Travail, job dating, intérim, agendas commerciaux/admin) de chaque meta.events SANS re-fetcher
l'API. Rapide (DB pur). events.py corrigé garde les prochains fetchs propres.

Usage: python clean_events.py [--dry-run] [--limit N]
"""
from __future__ import annotations
import os, json, re, argparse, sys
import psycopg
from events import AGENDA_BLOCK, NOISE_RE, AGENDA_SLUG_RE

DSN = os.environ.get("DATABASE_URL", "postgres://gemenskarte:gemenskarte@localhost:5434/gemenskarte")


def keep(ev: dict) -> bool:
    m = AGENDA_SLUG_RE.search(ev.get("url") or "")
    if m and m.group(1).lower() in AGENDA_BLOCK:
        return False
    # event stocké : pas de _text, on teste titre + lieu (suffit pour le résiduel emploi).
    txt = f"{ev.get('title','')} {ev.get('place','')}"
    if NOISE_RE.search(txt):
        return False
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--limit", type=int, default=None)
    args = ap.parse_args()
    lim = "" if args.limit is None else f"LIMIT {int(args.limit)}"
    with psycopg.connect(DSN, autocommit=False) as c:
        rows = c.execute(
            f"""SELECT id, meta->'events' FROM associations
                WHERE jsonb_array_length(coalesce(meta->'events','[]'::jsonb)) > 0 ORDER BY id {lim}"""
        ).fetchall()
        print(f"fiches avec events : {len(rows)} (dry-run={args.dry_run})", flush=True)
        n_touched = n_removed = 0
        for i, (aid, events) in enumerate(rows, 1):
            events = events or []
            kept = [e for e in events if keep(e)]
            if len(kept) == len(events):
                continue
            n_touched += 1; n_removed += len(events) - len(kept)
            if not args.dry_run:
                c.execute("UPDATE associations SET meta = jsonb_set(meta, '{events}', %s::jsonb) WHERE id = %s",
                          (json.dumps(kept), aid))
                if i % 500 == 0:
                    c.commit()
        if not args.dry_run:
            c.commit()
        print(f"\nFini : {n_touched} fiches nettoyées | {n_removed} événements-bruit retirés", flush=True)


if __name__ == "__main__":
    try: sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception: pass
    main()
