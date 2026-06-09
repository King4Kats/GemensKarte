"""Passe Presse — trouve les articles de journaux locaux mentionnant chaque asso.

Utilise DDG text search filtré sur les domaines de presse régionale
(Ouest-France, Le Télégramme, Actu.fr, Presse Océan, Vendée Matin…).
Stocke les résultats dans meta.pressArticles + meta.pressScrapedAt.
Idempotent : les assos déjà traitées sont ignorées sauf --redo.

Usage:
  python enrich_press.py [--limit N] [--redo] [--dry-run] [--sleep 2.0]
"""

import argparse
import json
import os
import random
import re
import sys
import time
from datetime import datetime, timezone
from urllib.parse import urlparse

import psycopg
from ddgs import DDGS
from ddgs.exceptions import DDGSException, RatelimitException, TimeoutException

DSN = os.environ.get(
    "DATABASE_URL", "postgres://gemenskarte:gemenskarte@localhost:5432/gemenskarte"
)

# Domaines presse régionale Bretagne / Pays de la Loire / Normandie
PRESS_DOMAINS = {
    "ouest-france.fr",
    "letelegramme.fr",
    "actu.fr",
    "presse-ocean.com",
    "vendeematin.fr",
    "le-courrier-de-louest.fr",
    "republicain-lorrain.fr",  # débord Normandie
    "paris-normandie.fr",
    "normandie.fr",
    "maville.com",            # portail local, contient des articles assos
    "ville.fr",
}

# Label affiché par domaine
SOURCE_LABELS = {
    "ouest-france.fr": "Ouest-France",
    "letelegramme.fr": "Le Télégramme",
    "actu.fr": "Actu.fr",
    "presse-ocean.com": "Presse Océan",
    "vendeematin.fr": "Vendée Matin",
    "le-courrier-de-louest.fr": "Le Courrier de l'Ouest",
    "paris-normandie.fr": "Paris-Normandie",
    "maville.com": "Maville",
}


def host_of(url: str) -> str:
    h = (urlparse(url).hostname or "").lower()
    return h[4:] if h.startswith("www.") else h


def base_domain(host: str) -> str:
    parts = host.split(".")
    return ".".join(parts[-2:]) if len(parts) >= 2 else host


def ddg_search(query: str, max_results: int = 10) -> list[dict]:
    with DDGS() as ddgs:
        return list(ddgs.text(query, region="fr-fr", max_results=max_results))


def search_with_retry(query: str, max_tries: int = 3, max_results: int = 10) -> list[dict]:
    delay = 5.0
    for attempt in range(1, max_tries + 1):
        try:
            return ddg_search(query, max_results=max_results)
        except RatelimitException:
            if attempt == max_tries:
                return []
            wait = delay * attempt + random.uniform(0, 3)
            print(f"      …rate-limit, pause {wait:.0f}s", flush=True)
            time.sleep(wait)
        except Exception:
            # DDGSException, TimeoutException, TypeError, etc.
            if attempt == max_tries:
                return []
            time.sleep(2.0 * attempt)
    return []


def find_press_articles(asso: dict) -> list[dict]:
    """Cherche des articles de presse pour cette asso via DDG."""
    name = asso["name"] or ""
    city = asso.get("city") or ""

    # Nettoie le nom (retire parenthèses, caractères spéciaux)
    clean_name = re.sub(r"[\"'«»\(\)]", "", name).strip()

    # Deux requêtes : précise (nom exact) + plus large (nom + ville)
    queries = [
        f'"{clean_name}" {city}',
        f'{clean_name} {city} association',
    ]

    articles: list[dict] = []
    seen_urls: set[str] = set()

    for query in queries:
        if len(articles) >= 3:
            break
        try:
            results = search_with_retry(query, max_results=8)
        except Exception as ex:
            print(f"      DDG error on query {query[:40]!r}: {ex}", flush=True)
            results = []
        for r in results:
            url = r.get("href") or r.get("url") or ""
            if not url or url in seen_urls:
                continue
            try:
                host = host_of(url)
            except Exception:
                continue
            domain = base_domain(host)
            if domain not in PRESS_DOMAINS:
                continue
            seen_urls.add(url)
            articles.append({
                "title": (r.get("title") or "")[:200],
                "url": url,
                "source": SOURCE_LABELS.get(domain, domain),
                "domain": domain,
                "snippet": (r.get("body") or "")[:280],
            })
            if len(articles) >= 3:
                break

    return articles


def fetch_pending(conn, limit, redo: bool) -> list[dict]:
    cond = "" if redo else "AND (meta ? 'pressScrapedAt') IS NOT TRUE"
    lim = "" if limit is None else f"LIMIT {int(limit)}"
    rows = conn.execute(
        f"""SELECT id, name, city, postal_code
            FROM associations
            WHERE location IS NOT NULL
              AND status = 'published'
              {cond}
            ORDER BY id {lim}"""
    ).fetchall()
    return [{"id": str(r[0]), "name": r[1], "city": r[2], "postalCode": r[3]} for r in rows]


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--redo", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--sleep", type=float, default=2.0)
    args = ap.parse_args()

    with psycopg.connect(DSN, autocommit=False) as conn:
        batch = fetch_pending(conn, args.limit, args.redo)
        total = len(batch)
        print(f"À traiter : {total} assos (dry-run={args.dry_run})", flush=True)

        n_found = n_empty = n_err = 0

        for i, asso in enumerate(batch, 1):
            t0 = time.time()
            try:
                articles = find_press_articles(asso)
            except Exception as exc:
                import traceback as _tb
                n_err += 1
                print(f"  [{i}/{total}] ERR {type(exc).__name__}: {exc}", flush=True)
                _tb.print_exc(file=sys.stdout)
                sys.stdout.flush()
                time.sleep(args.sleep)
                continue

            ts = datetime.now(timezone.utc).isoformat(timespec="seconds")
            meta_patch = json.dumps({
                "pressArticles": articles,
                "pressScrapedAt": ts,
            })

            if articles:
                n_found += 1
            else:
                n_empty += 1

            if not args.dry_run:
                conn.execute(
                    "UPDATE associations SET meta = meta || %s::jsonb WHERE id = %s",
                    (meta_patch, asso["id"]),
                )
                conn.commit()

            dt = time.time() - t0
            sources = ", ".join(a["source"] for a in articles) or "—"
            print(
                f"  [{i}/{total}] {asso['name'][:38]:38s} {dt:4.1f}s  "
                f"articles={len(articles)}  {sources[:50]}",
                flush=True,
            )

            time.sleep(args.sleep + random.uniform(0, 0.8))

    print(
        f"\nFini : {total} | avec articles: {n_found} | vides: {n_empty} | erreurs: {n_err}",
        flush=True,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
