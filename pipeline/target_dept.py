"""Renvoie le DEPARTEMENT actif pour le pipeline (progression region par region).

On traite un seul departement a la fois, dans l'ordre de la liste, et on imprime le
PREMIER qui a encore du travail ; quand il est epuise, on passe au suivant.

"Travail restant" = AU MOINS une asso geolocalisee qui :
  - n'a pas eu la decouverte generale (meta.discovery NULL), OU
  - manque une passe ciblee (fb/ig/site/helloasso) ET n'a PAS deja le lien ET n'a PAS
    deja un candidat en attente (meme logique exacte que fetch_pending des passes).
=> quand les passes ne trouvent plus rien a faire, ce script renvoie 0 pour le dept et
   on AVANCE automatiquement au suivant (corrige le blocage Vendee/Lot du 2026-06).

Usage : python target_dept.py "46,12,09,..." [dept_courant]
"""

from __future__ import annotations

import os
import sys

import psycopg

DSN = os.environ.get(
    "DATABASE_URL", "postgres://gemenskarte:gemenskarte@localhost:5433/gemenskarte"
)
CONNECT_TIMEOUT = 10
STATEMENT_TIMEOUT_MS = 60000

# Une asso "en travail" = mêmes conditions que fetch_pending (sinon les assos qui avaient
# deja un lien, donc jamais marquees, gardaient le dept "non fini" a l'infini).
SQL = """SELECT EXISTS(
  SELECT 1 FROM associations
  WHERE department = %s AND location IS NOT NULL
    AND (
      (meta -> 'discovery') IS NULL
      OR ((meta ->> 'fbTargetedAt') IS NULL
          AND NOT (COALESCE(social,'{}'::jsonb) ? 'facebook')
          AND NOT (COALESCE(meta->'discovery'->'socialCandidates','[]'::jsonb) @> '[{"platform":"facebook"}]'::jsonb))
      OR ((meta ->> 'igTargetedAt') IS NULL
          AND NOT (COALESCE(social,'{}'::jsonb) ? 'instagram')
          AND NOT (COALESCE(meta->'discovery'->'socialCandidates','[]'::jsonb) @> '[{"platform":"instagram"}]'::jsonb))
      OR ((meta ->> 'webTargetedAt') IS NULL
          AND NOT (COALESCE(social,'{}'::jsonb) ? 'website'))
      OR ((meta ->> 'helloassoCheckedAt') IS NULL
          AND NOT (COALESCE(social,'{}'::jsonb) ? 'helloasso')
          AND NOT (COALESCE(meta->'discovery'->'socialCandidates','[]'::jsonb) @> '[{"platform":"helloasso"}]'::jsonb))
    )
  LIMIT 1)"""


def main() -> int:
    raw = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("GK_TARGETS", "85")
    current = sys.argv[2].strip() if len(sys.argv) > 2 else ""
    targets = [t.strip() for t in raw.replace(";", ",").split(",") if t.strip()]
    if not targets:
        targets = ["85"]
    start = targets.index(current) if current in targets else 0
    with psycopg.connect(DSN, connect_timeout=CONNECT_TIMEOUT) as conn:
        conn.execute(f"SET statement_timeout = {STATEMENT_TIMEOUT_MS}")
        for dept in targets[start:]:
            if conn.execute(SQL, (dept,)).fetchone()[0]:
                print(dept)
                return 0
    print(targets[-1])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
