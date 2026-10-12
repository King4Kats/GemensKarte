#!/usr/bin/env python3
"""Battement de coeur du superviseur -> table pipeline_heartbeat (1 ligne).

Le superviseur (PC) appelle ce script a chaque cycle en lui passant l'etat des passes
sur stdin (JSON). Le VPS lit cette ligne pour decider d'alerter : il ne le fait QUE si le
battement est recent (PC allume) -> aucune fausse alerte la nuit quand le PC est eteint.

Les VPS de recherche ecrivent AUSSI un battement, chacun sur SA ligne (--id 2 VPS 1,
--id 3 backup, defaut 1 = PC) : gk-watch les surveille separement (un VPS est 24/7,
son battement absent = probleme, contrairement au PC).

Usage : echo '{"dept":"85","jobs":{...},"issues":[...]}' | python3 heartbeat.py [--id N]
"""
import argparse
import os
import sys

import psycopg

DSN = os.environ.get(
    "DATABASE_URL", "postgres://gemenskarte:gemenskarte@localhost:5434/gemenskarte"
)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--id", type=int, default=1, help="1=PC, 2=VPS 1, 3=VPS 2")
    args = ap.parse_args()
    payload = sys.stdin.read().strip() or "{}"
    with psycopg.connect(DSN, connect_timeout=10) as conn:
        conn.execute(
            "CREATE TABLE IF NOT EXISTS pipeline_heartbeat "
            "(id int PRIMARY KEY, ts timestamptz, status jsonb)"
        )
        conn.execute(
            "INSERT INTO pipeline_heartbeat (id, ts, status) "
            "VALUES (%s, now(), %s::jsonb) "
            "ON CONFLICT (id) DO UPDATE SET ts = now(), status = EXCLUDED.status",
            (args.id, payload),
        )
        conn.commit()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
