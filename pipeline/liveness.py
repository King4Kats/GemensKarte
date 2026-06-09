"""SCRAP 5 — Liveness checker des liens (HTTP pur, zéro LLM) -> meta.linkHealth

Vérifie la DISPONIBILITÉ RÉELLE des liens servis sur la fiche :
  - `website`  : colonne curée prioritaire, sinon social.website (= ce que l'API sert vraiment) ;
  - `helloasso`: social.helloasso.
On NE vérifie PAS facebook/instagram/linkedin : ces plateformes renvoient 403/login-wall à
tout crawler -> un échec HTTP n'y prouve RIEN sur la vie de la page (on garde le jugement LLM
sur titre+snippet, cf. verify_llm). Les vérifier ferait de faux morts.

Classement par lien :
  alive   : 2xx / 3xx
  dead    : 404 / 410 / connexion impossible (DNS, ConnectError) / URL malformée  -> COMPTE comme échec
  blocked : 403 / 401 / 429 (anti-bot)  -> NON concluant, n'incrémente pas l'échec
  error   : timeout / 5xx / protocole   -> transitoire, n'incrémente pas l'échec

Écrit meta.linkHealth{platform:{url,status,httpCode,checkedAt,consecutiveFailures}}
+ meta.linkHealthAt (marqueur de fraîcheur, sert au gating de re-vérif).
N'ÉCRIT JAMAIS dans `social` (c'est apply.py qui décide, via une gate linkHealth).

Idempotent + re-vérif périodique : ne reprend une fiche que si linkHealthAt absent OU plus
vieux que --max-age jours. consecutiveFailures s'accumule entre passes -> apply ne retire un
lien qu'après >=2 morts confirmés (évite de tuer sur un blip réseau).

Usage:
  python liveness.py [--limit N] [--dept 85] [--dry-run] [--max-age 14] [--sleep 0.4]
"""

from __future__ import annotations

import argparse
import concurrent.futures as cf
import json
import os
import sys
from datetime import datetime, timezone

import httpx
import psycopg

DSN = os.environ.get(
    "DATABASE_URL", "postgres://gemenskarte:gemenskarte@localhost:5433/gemenskarte"
)
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")

DEAD_EXC = {"ConnectError", "ConnectTimeout", "UnsupportedProtocol",
            "InvalidURL", "LocalProtocolError"}


def normalize_url(url: str) -> str | None:
    url = (url or "").strip()
    if not url:
        return None
    if not url.startswith(("http://", "https://")):
        url = "https://" + url
    return url


def classify(url: str) -> tuple[str, str]:
    """Renvoie (status, httpCode_ou_exc). status ∈ alive|dead|blocked|error.
    Double-check : un 'dead' est re-testé une fois (anti-blip) ; ne reste dead que si confirmé."""
    status, code = _probe(url)
    if status == "dead":
        status2, code2 = _probe(url)
        if status2 != "dead":
            return status2, code2  # le 1er échec était transitoire
    return status, code


def _probe(url: str) -> tuple[str, str]:
    try:
        with httpx.Client(follow_redirects=True, timeout=10.0,
                          headers={"User-Agent": UA}) as h:
            r = h.head(url)
            if r.status_code in (403, 405, 401, 429) or r.status_code >= 500:
                r = h.get(url)  # certains serveurs refusent HEAD -> retry GET
            code = r.status_code
    except Exception as e:
        name = type(e).__name__
        return ("dead" if name in DEAD_EXC else "error", name)

    if code in (404, 410):
        return ("dead", str(code))
    if code in (403, 401, 429):
        return ("blocked", str(code))
    if 200 <= code < 400:
        return ("alive", str(code))
    return ("error", str(code))


def fetch_pending(conn, limit, dept, max_age, suspect_age):
    # Gating à 2 vitesses : un lien SUSPECT (dead/error au dernier check) est re-vérifié
    # sous `suspect_age` jours (confirmation rapide -> la gate apply peut retirer vite) ;
    # un lien sain attend `max_age` jours (re-vérif périodique de fraîcheur).
    conds = [
        "(coalesce(website, social->>'website') IS NOT NULL OR social ? 'helloasso')",
        "(NOT (meta ? 'linkHealthAt') OR (meta->>'linkHealthAt')::timestamptz < now() - "
        " make_interval(days => CASE WHEN "
        "   meta->'linkHealth'->'website'->>'status' IN ('dead','error') OR "
        "   meta->'linkHealth'->'helloasso'->>'status' IN ('dead','error') "
        "   THEN %(suspect)s ELSE %(maxage)s END))",
    ]
    if dept:
        conds.append("department = %(dept)s")
    where = " AND ".join(conds)
    lim = "" if limit is None else f"LIMIT {int(limit)}"
    rows = conn.execute(
        f"""SELECT id, name, coalesce(website, social->>'website'),
                   social->>'helloasso', meta->'linkHealth'
            FROM associations WHERE {where} ORDER BY id {lim}""",
        {"dept": dept, "maxage": max_age, "suspect": suspect_age},
    ).fetchall()
    return [{"id": str(r[0]), "name": r[1], "website": r[2],
             "helloasso": r[3], "health": r[4] or {}} for r in rows]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--dept", default=None)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--max-age", type=int, default=14, help="re-vérif lien sain (jours)")
    ap.add_argument("--suspect-age", type=int, default=1, help="re-vérif lien dead/error (jours)")
    ap.add_argument("--workers", type=int, default=32, help="checks HTTP concurrents (réseau)")
    args = ap.parse_args()

    with psycopg.connect(DSN, autocommit=False) as conn:
        batch = fetch_pending(conn, args.limit, args.dept, args.max_age, args.suspect_age)
        total = len(batch)
        print(f"SCRAP 5 — liveness : {total} assos (max-age={args.max_age}j, "
              f"workers={args.workers}, dry-run={args.dry_run}).", flush=True)

        # Phase 1 — normaliser les cibles (website + helloasso) en jobs plats.
        jobs = []  # (idx, plat, url)
        for idx, asso in enumerate(batch):
            for plat in ("website", "helloasso"):
                url = normalize_url(asso[plat])
                if url:
                    jobs.append((idx, plat, url))

        # Phase 2 — checks HTTP concurrents (borné réseau, domaines distincts -> safe).
        def work(job):
            idx, plat, url = job
            status, code = classify(url)
            return idx, plat, url, status, code

        checks = {}  # (idx, plat) -> (url, status, code)
        done = 0
        with cf.ThreadPoolExecutor(max_workers=args.workers) as ex:
            for idx, plat, url, status, code in ex.map(work, jobs):
                checks[(idx, plat)] = (url, status, code)
                done += 1
                if done % 100 == 0:
                    print(f"  …{done}/{len(jobs)} liens vérifiés", flush=True)

        # Phase 3 — écriture par asso (commit par ligne, reprenable).
        n_alive = n_dead = n_blocked = n_error = n_confirmed_dead = 0
        ts = datetime.now(timezone.utc).isoformat(timespec="seconds")
        for idx, asso in enumerate(batch):
            health, parts = {}, []
            for plat in ("website", "helloasso"):
                if (idx, plat) not in checks:
                    continue
                url, status, code = checks[(idx, plat)]
                prev = (asso["health"].get(plat) or {})
                same = prev.get("url") == url
                prev_fail = int(prev.get("consecutiveFailures", 0)) if same else 0
                fails = prev_fail + 1 if status == "dead" else (0 if status == "alive" else prev_fail)
                # firstFailAt : début de la série d'échecs en cours (sert au gating temporel
                # du reaper pour ne pas retirer un site sur une panne passagère).
                if status == "dead":
                    first_fail = prev.get("firstFailAt") if (same and prev.get("firstFailAt")) else ts
                elif status == "alive":
                    first_fail = None
                else:
                    first_fail = prev.get("firstFailAt") if same else None
                health[plat] = {
                    "url": url, "status": status, "httpCode": code,
                    "checkedAt": ts, "consecutiveFailures": fails, "firstFailAt": first_fail,
                }
                n_alive += status == "alive"
                n_dead += status == "dead"
                n_blocked += status == "blocked"
                n_error += status == "error"
                if status == "dead" and fails >= 2:
                    n_confirmed_dead += 1
                parts.append(f"{plat}={status}({code}){'!' if fails >= 2 else ''}")

            if not health:
                continue
            if not args.dry_run:
                conn.execute(
                    "UPDATE associations SET meta = meta || %s::jsonb WHERE id = %s",
                    (json.dumps({"linkHealth": {**asso["health"], **health},
                                 "linkHealthAt": ts}), asso["id"]),
                )
                conn.commit()
            if n_confirmed_dead or "dead" in " ".join(parts):
                print(f"  [{idx+1}/{total}] {asso['name'][:34]:34} {' '.join(parts)}", flush=True)

        print(f"\nSCRAP 5 fini : {total} assos | alive={n_alive} dead={n_dead} "
              f"blocked={n_blocked} error={n_error} | morts confirmés(>=2)={n_confirmed_dead}",
              flush=True)
    return 0


if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
    sys.exit(main())
