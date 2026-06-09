"""SCRAP 9 (test faisabilité) — récupère un SITE WEB candidat depuis la page Facebook.

Idée (cf. capture utilisateur) : pour les assos qui n'ont QUE leur Facebook, le site est
souvent écrit dans l'« Intro » de la page FB. FB est 403 anti-bot, mais DDG indexe l'Intro :
le SNIPPET du résultat facebook.com contient parfois le domaine.

Ce script (mode test) interroge DDG pour des fiches FB-only, parse le snippet du résultat FB
(et les autres résultats) à la recherche d'un domaine plausible, et l'affiche (dry-run).
NE écrit rien par défaut. À industrialiser ensuite (candidat -> verification -> apply).

Usage: python fb_website.py [--limit 15] [--sleep 2.5] [--apply]   (--apply écrit meta.fbWebsite)
"""
from __future__ import annotations
import os, re, json, argparse, sys, time
from datetime import datetime, timezone
import psycopg
from discover import search_with_retry
from lib_match import host_of, base_domain, DIRECTORY_HOSTS, SOCIAL_HOSTS, tokens, strip_accents

DSN = os.environ.get("DATABASE_URL", "postgres://gemenskarte:gemenskarte@localhost:5433/gemenskarte")
DOMAIN_RE = re.compile(r"\b([a-z0-9][a-z0-9-]{1,40}\.(?:fr|com|org|net|bzh|eu|info))\b", re.I)
BAD_DOMAINS = set(SOCIAL_HOSTS) | DIRECTORY_HOSTS | {
    "google.com", "gstatic.com", "goo.gl", "bit.ly", "linktr.ee", "google.fr",
    "youtube.com", "gmail.com", "wixsite.com", "blogspot.com",
}


def candidate_from_results(results: list[dict], name: str) -> dict | None:
    name_tok = tokens(name)
    name_flat = strip_accents(name).lower().replace(" ", "")
    best = None
    for r in results:
        href = r.get("href") or r.get("url") or ""
        body = r.get("body") or r.get("snippet") or ""
        title = r.get("title") or ""
        host = host_of(href)
        bdom = base_domain(host)
        is_fb = bdom in ("facebook.com", "fb.com")
        # domaines mentionnés dans le snippet (l'Intro FB y figure) + le href si site direct
        pool = set(DOMAIN_RE.findall(f"{body} {title}"))
        if not is_fb and bdom not in BAD_DOMAINS:
            pool.add(bdom)
        for dom in pool:
            d = dom.lower()
            db = base_domain(d)
            if db in BAD_DOMAINS or len(db) < 5:
                continue
            flat = db.split(".")[0].replace("-", "")
            score = 0
            if tokens(db.replace(".", " ")) & name_tok:
                score += 2
            if len(flat) >= 5 and flat in name_flat:
                score += 2
            if is_fb:
                score += 1  # vient bien du snippet de la page FB
            if score >= 2 and (best is None or score > best["score"]):
                best = {"domain": db, "score": score, "fromFb": is_fb, "snippet": body[:120]}
    return best


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=15)
    ap.add_argument("--sleep", type=float, default=2.5)
    ap.add_argument("--apply", action="store_true", help="écrit meta.fbWebsite (sinon dry-run)")
    args = ap.parse_args()
    ts = datetime.now(timezone.utc).isoformat(timespec="seconds")
    with psycopg.connect(DSN, autocommit=False) as c:
        rows = c.execute(
            """SELECT id, name, city FROM associations
               WHERE social ? 'facebook'
                 AND coalesce(website, social->>'website') IS NULL
                 AND NOT (meta ? 'fbWebsiteCheckedAt')
               ORDER BY id LIMIT %s""", (args.limit,)).fetchall()
        print(f"FB-only à sonder : {len(rows)} (sleep={args.sleep}, apply={args.apply})", flush=True)
        n_found = 0
        for aid, name, city in rows:
            q = f"{name} {city or ''} Vendée"
            try:
                results = search_with_retry(q)
            except Exception as e:
                print(f"  {name[:36]:36} ERR {type(e).__name__}", flush=True); continue
            cand = candidate_from_results(results, name)
            if cand:
                n_found += 1
                print(f"  ✔ {name[:34]:34} -> {cand['domain']:28} (score {cand['score']}, fb={cand['fromFb']})", flush=True)
                if args.apply:
                    c.execute("UPDATE associations SET meta = meta || %s::jsonb WHERE id=%s",
                              (json.dumps({"fbWebsite": {"url": "https://" + cand["domain"], **cand}, "fbWebsiteCheckedAt": ts}), aid))
                    c.commit()
            else:
                print(f"  · {name[:34]:34} (aucun domaine plausible)", flush=True)
                if args.apply:
                    c.execute("UPDATE associations SET meta = meta || %s::jsonb WHERE id=%s",
                              (json.dumps({"fbWebsiteCheckedAt": ts}), aid)); c.commit()
            time.sleep(args.sleep)
        print(f"\nTest fini : {n_found}/{len(rows)} avec site candidat", flush=True)

if __name__ == "__main__":
    try: sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception: pass
    main()
