"""SCRAP 3 — Filtre presse (DB pur, zéro réseau)

Les articles de presse (meta.pressArticles) sont déjà fiables à ~98 %. On retire seulement
le bruit identifié à l'audit :
  - avis de décès / nécrologie / obsèques (DDG a matché sur le nom de la VILLE) ;
  - titres malformés (snippets concaténés, doubles « … », mentions « Siège social - »).

Conserve les articles retirés dans meta.pressRemoved (audit), réécrit meta.pressArticles propre.
Idempotent : un article déjà filtré ne revient pas.

Usage:
  python press_filter.py [--limit N] [--dept 85] [--dry-run]
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from datetime import datetime, timezone

import psycopg

DSN = os.environ.get(
    "DATABASE_URL", "postgres://gemenskarte:gemenskarte@localhost:5433/gemenskarte"
)

DEATH = re.compile(
    r"avis de d[ée]c[èe]s|n[ée]crologie|obs[èe]ques|carnet (du jour|de deuil|noir)"
    r"|in memoriam|hommage.*d[ée]c[ée]d|fun[ée]railles|condol[ée]ances",
    re.IGNORECASE,
)
MALFORMED = re.compile(r"\.\.\..*\.\.\.|si[èe]ge social\s*-|\.{3}\s*-\s*[A-Z]", re.IGNORECASE)

# --- Extraction de date de publication ---------------------------------------
# 1) snippet DDG : préfixe absolu "Sep 13, 2025 ·" ou relatif "1 day ago ·".
_MONTHS = {m: i for i, m in enumerate(
    ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], 1)}
ABS_DATE = re.compile(r"\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+(\d{1,2}),\s+(\d{4})", re.I)
REL_DATE = re.compile(r"\b(\d+)\s+(hour|day|week|month|year)s?\s+ago", re.I)
# 2) URL Ouest-France : UUID v1 (le nibble de version = 1) encode le timestamp de création.
UUID_V1 = re.compile(r"([0-9a-f]{8})-([0-9a-f]{4})-1([0-9a-f]{3})-[0-9a-f]{4}-[0-9a-f]{12}", re.I)
_REL_DELTA = {"hour": 1 / 24, "day": 1, "week": 7, "month": 30, "year": 365}


def _uuid_v1_date(url: str):
    m = UUID_V1.search(url)
    if not m:
        return None
    low, mid, hi = int(m.group(1), 16), int(m.group(2), 16), int(m.group(3), 16)
    ts100 = (hi << 48) | (mid << 32) | low                 # 100-ns depuis 1582-10-15
    unix = (ts100 - 0x01B21DD213814000) / 1e7
    if not (0 < unix < 4102444800):                        # garde-fou 1970..2100
        return None
    return datetime.fromtimestamp(unix, tz=timezone.utc)


def extract_published(art: dict, now: datetime):
    """Renvoie la date de publication (datetime UTC) ou None."""
    d = _uuid_v1_date(art.get("url", ""))
    if d:
        return d
    sn = art.get("snippet", "") or ""
    m = ABS_DATE.search(sn)
    if m:
        try:
            return datetime(int(m.group(3)), _MONTHS[m.group(1)[:3].lower()],
                            int(m.group(2)), tzinfo=timezone.utc)
        except (ValueError, KeyError):
            pass
    m = REL_DATE.search(sn)
    if m:
        from datetime import timedelta
        return now - timedelta(days=int(m.group(1)) * _REL_DELTA[m.group(2).lower()])
    return None


# --- Détecteurs de bruit non-article -----------------------------------------
COMMUNE_LANDING = re.compile(r"/[a-z0-9-]+-\d{5}/?$", re.I)   # .../les-herbiers-85500/
MAVILLE_HOME = re.compile(r"^https?://[^/]*maville\.com/?$", re.I)


def article_noise(art: dict) -> str | None:
    """Bruit structurel : page d'atterrissage commune, home maville, annuaire infolocale."""
    url = art.get("url", "") or ""
    if MAVILLE_HOME.search(url):
        return "home maville (pas un article)"
    if "infolocale" in url and "/article-" not in url:
        return "page annuaire infolocale (pas un article)"
    if "ouest-france.fr" in url and COMMUNE_LANDING.search(url):
        return "page commune Ouest-France (pas un article)"
    return None


def is_noise(art: dict, now: datetime, stale_years: int) -> str | None:
    text = f"{art.get('title','')} {art.get('snippet','')}"
    if DEATH.search(text):
        return "avis de décès"
    title = art.get("title", "")
    if len(title) > 110 or MALFORMED.search(title):
        return "titre malformé"
    n = article_noise(art)
    if n:
        return n
    pub = art.get("publishedAt")
    if pub:
        try:
            age_y = (now - datetime.fromisoformat(pub)).days / 365
            if age_y > stale_years:
                return f"périmé (>{stale_years} ans)"
        except (ValueError, TypeError):
            pass
    return None


def fetch_pending(conn, limit, dept):
    conds = ["jsonb_array_length(meta->'pressArticles') > 0"]
    if dept:
        conds.append("department = %(dept)s")
    where = " AND ".join(conds)
    lim = "" if limit is None else f"LIMIT {int(limit)}"
    rows = conn.execute(
        f"""SELECT id, name, meta->'pressArticles', coalesce(meta->'pressRemoved','[]'::jsonb)
            FROM associations WHERE {where} ORDER BY id {lim}""",
        {"dept": dept},
    ).fetchall()
    return [{"id": str(r[0]), "name": r[1], "articles": r[2] or [], "removedBefore": r[3] or []}
            for r in rows]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--dept", default=None)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--stale-years", type=int, default=3, help="article plus vieux -> retiré")
    args = ap.parse_args()

    with psycopg.connect(DSN, autocommit=False) as conn:
        batch = fetch_pending(conn, args.limit, args.dept)
        total = len(batch)
        print(f"SCRAP 3 — presse à filtrer : {total} assos "
              f"(stale>{args.stale_years}ans, dry-run={args.dry_run}).", flush=True)

        now = datetime.now(timezone.utc)
        ts = now.isoformat(timespec="seconds")
        n_removed = n_touched = n_dated = 0
        reasons: dict[str, int] = {}
        for asso in batch:
            kept, removed = [], []
            for art in asso["articles"]:
                pub = extract_published(art, now)
                a = {**art}
                if pub:
                    a["publishedAt"] = pub.isoformat(timespec="seconds")
                    n_dated += 1
                why = is_noise(a, now, args.stale_years)
                if why:
                    a["removedReason"] = why
                    removed.append(a)
                    reasons[why.split(" (")[0]] = reasons.get(why.split(" (")[0], 0) + 1
                else:
                    kept.append(a)
            # idempotent : on n'écrit que si qqch a changé (retrait OU date ajoutée).
            changed = bool(removed) or kept != asso["articles"]
            if not changed:
                continue
            if removed:
                n_touched += 1
            n_removed += len(removed)
            all_removed = (asso["removedBefore"] + removed) if removed else asso["removedBefore"]
            if not args.dry_run:
                conn.execute(
                    """UPDATE associations
                       SET meta = jsonb_set(
                             meta || %s::jsonb,
                             '{pressArticles}', %s::jsonb)
                       WHERE id = %s""",
                    (json.dumps({"pressRemoved": all_removed, "pressFilteredAt": ts}),
                     json.dumps(kept), asso["id"]),
                )
                conn.commit()
            if removed:
                print(f"  {asso['name'][:40]:40} -{len(removed)} ({removed[0]['removedReason']})", flush=True)
        print(f"\nSCRAP 3 fini : {total} assos | {n_touched} nettoyées | {n_removed} retirés "
              f"| {n_dated} datés | raisons={reasons}", flush=True)
    return 0


if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
    sys.exit(main())
