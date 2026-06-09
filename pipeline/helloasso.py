"""Passe HelloAsso — recherche ciblée du profil HelloAsso de chaque association.

HelloAsso est un tier FIABLE (slug vérifié par la plateforme), mais la découverte
générale ne le remonte pas toujours (noyé dans le top-10 DDG). Ici on fait une requête
`site:helloasso.com` dédiée et on applique le lien quand le slug matche le nom de l'asso.

Écrit `social.helloasso` directement (effet immédiat) + `meta.helloassoFound` (pour que
apply.py le conserve au rebuild) + `meta.helloassoCheckedAt` (idempotence : pas de re-check).

Usage:
  python helloasso.py [--limit N] [--dept 85] [--redo] [--dry-run] [--sleep 1.5]
"""

from __future__ import annotations

import argparse
import json
import os
import random
import re
import sys
import time
from datetime import datetime, timezone

import psycopg

from discover import search_with_retry
from lib_match import tokens, host_of, base_domain, normalize_social

DSN = os.environ.get(
    "DATABASE_URL", "postgres://gemenskarte:gemenskarte@localhost:5433/gemenskarte"
)


# Tokens géo/région NON discriminants : un slug HelloAsso ne doit pas matcher LÀ-DESSUS
# seulement (sinon "dcf-vendee" matcherait "… Vendée Surf"). Auto-apply = on exige précis.
GEO_TOK = {
    "vendee", "loire", "atlantique", "bretagne", "normandie", "france",
    "francais", "francaise", "pays", "departemental", "departement",
    "regional", "region", "ouest", "nord", "sud", "est", "maritime",
}


def find_helloasso(asso: dict, results: list[dict]) -> str | None:
    name_tok = tokens(asso["name"])
    city_tok = tokens(asso.get("city") or "")
    # discriminants = nom − ville − tokens géo − nombres (ex: "85")
    disc = {t for t in (name_tok - city_tok - GEO_TOK) if not t.isdigit()}
    if not disc:
        return None
    for r in results:
        url = r.get("href") or r.get("url") or ""
        if not url or base_domain(host_of(url)) != "helloasso.com":
            continue
        norm = normalize_social("helloasso", url)
        if not norm:
            continue
        slug_tok = tokens(re.sub(r"[-_]+", " ", norm["slug"]))
        overlap = disc & slug_tok
        if not overlap:
            continue
        # Tokens du slug NON expliqués par le nom/ville/géo, et assez longs pour être
        # distinctifs (une autre ville/orga, ex: "cognacais") → signe d'un MAUVAIS match.
        foreign = {t for t in (slug_tok - name_tok - city_tok - GEO_TOK) if len(t) > 3}
        # Strict (auto-apply fiable) : le nom domine le slug ET aucun token étranger distinctif.
        if len(overlap) >= max(1, len(disc) - 1) and not foreign:
            return norm["url"]
    return None


def fetch_pending(conn, limit, dept, redo):
    conds = ["location IS NOT NULL", "NOT (social ? 'helloasso')"]
    if not redo:
        conds.append("(meta ? 'helloassoCheckedAt') IS NOT TRUE")
    if dept:
        conds.append("department = %(dept)s")
    where = " AND ".join(conds)
    lim = "" if limit is None else f"LIMIT {int(limit)}"
    rows = conn.execute(
        f"""SELECT id, name, city, department FROM associations
            WHERE {where} ORDER BY id {lim}""",
        {"dept": dept},
    ).fetchall()
    return [{"id": str(r[0]), "name": r[1], "city": r[2], "department": r[3]} for r in rows]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--dept", default=None)
    ap.add_argument("--redo", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--sleep", type=float, default=1.5)
    args = ap.parse_args()

    with psycopg.connect(DSN, autocommit=False) as conn:
        batch = fetch_pending(conn, args.limit, args.dept, args.redo)
        total = len(batch)
        print(f"HelloAsso — à chercher : {total} assos (dry-run={args.dry_run}).", flush=True)

        n_found = n_err = 0
        for i, asso in enumerate(batch, 1):
            ts = datetime.now(timezone.utc).isoformat(timespec="seconds")
            try:
                results = search_with_retry(
                    f"{asso['name']} {asso.get('city') or ''} site:helloasso.com"
                )
                url = find_helloasso(asso, results)
            except Exception as exc:
                n_err += 1
                print(f"  [{i}/{total}] {asso['name'][:36]:36} ERR {type(exc).__name__}", flush=True)
                continue

            if url:
                n_found += 1
            if not args.dry_run:
                if url:
                    conn.execute(
                        """UPDATE associations
                           SET social = COALESCE(social,'{}'::jsonb) || jsonb_build_object('helloasso', %s),
                               meta = meta || %s::jsonb
                           WHERE id = %s""",
                        (url, json.dumps({"helloassoFound": url, "helloassoCheckedAt": ts}), asso["id"]),
                    )
                else:
                    conn.execute(
                        "UPDATE associations SET meta = meta || %s::jsonb WHERE id = %s",
                        (json.dumps({"helloassoCheckedAt": ts}), asso["id"]),
                    )
                conn.commit()

            print(f"  [{i}/{total}] {asso['name'][:36]:36} {'✓ ' + url if url else '—'}", flush=True)
            time.sleep(args.sleep + random.uniform(0, 0.5))

        print(f"\nHelloAsso fini : {total} assos | trouvés: {n_found} | erreurs: {n_err}", flush=True)
    return 0


if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
    sys.exit(main())
