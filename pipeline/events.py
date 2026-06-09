"""SCRAP 8 — Agenda à venir (API OpenAgenda via Opendatasoft) -> meta.events

Source : dataset PUBLIC 'evenements-publics-openagenda' (public.opendatasoft.com), API REST
SANS auth, licence ouverte. On NE scrape PAS infolocale (403 anti-bot total).

ARCHI efficace (anti rate-limit) : il n'y a que ~quelques centaines d'événements À VENIR sur
le département -> on les récupère TOUS en ~3 appels paginés (around le centroïde Vendée), puis
on assigne par PROXIMITÉ EN MÉMOIRE (haversine). 3 appels/run au lieu de 1/commune (573).

Pour chaque asso géolocalisée :
  - événements dans son rayon, MATCHÉS au nom (>=2 tokens distinctifs >=5 car.) -> matchedAsso=true ;
  - complétés par les plus proches (matchedAsso=false) -> agenda jamais vide.
Écrit meta.events[{title,start,end,dateLabel,city,place,url,image,matchedAsso,distKm}] + eventsScrapedAt.

Idempotent + frais : ne ré-assigne une asso que si eventsScrapedAt > --max-age jours (3) ou --redo.

Usage:
  python events.py [--limit N] [--radius 12] [--max-age 3] [--cap 6] [--dry-run] [--redo]
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
import time
from datetime import datetime, timezone

import httpx
import psycopg

from lib_match import tokens

DSN = os.environ.get("DATABASE_URL", "postgres://gemenskarte:gemenskarte@localhost:5433/gemenskarte")
ODS = ("https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/"
       "evenements-publics-openagenda/records")
# Centroïde Vendée + rayon englobant tout le département (avec marge).
VENDEE = (46.67, -1.43)
DEPT_RADIUS_KM = 70  # englobe la Vendée + marge, sans noyer sous les events de Nantes/La Rochelle


def haversine(lat1, lon1, lat2, lon2) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def norm_event(e: dict) -> dict:
    loc = e.get("location_coordinates") or {}
    return {
        "uid": e.get("uid"),
        "title": e.get("title_fr"),
        "start": e.get("firstdate_begin"),
        "end": e.get("lastdate_end") or e.get("firstdate_end"),
        "dateLabel": e.get("daterange_fr"),
        "city": e.get("location_city"),
        "place": e.get("location_name"),
        "url": e.get("canonicalurl"),
        "image": e.get("thumbnail") or e.get("image"),
        "_text": " ".join(filter(None, [
            e.get("title_fr"), e.get("description_fr"),
            " ".join(e.get("keywords_fr") or []) if isinstance(e.get("keywords_fr"), list) else "",
        ])),
        "_lat": loc.get("lat"), "_lon": loc.get("lon"),
    }


def fetch_all_events(client, hard_cap=3000) -> list[dict]:
    """Récupère TOUS les événements à venir du département en paginant (~3 appels)."""
    out, offset = [], 0
    where = (f"within_distance(location_coordinates, geom'POINT({VENDEE[1]} {VENDEE[0]})', "
             f"{DEPT_RADIUS_KM}km) AND firstdate_begin >= now()")
    while offset < hard_cap:
        params = {"where": where, "order_by": "firstdate_begin", "limit": 100, "offset": offset}
        for attempt in range(4):
            try:
                r = client.get(ODS, params=params, timeout=25.0)
                if r.status_code == 429:
                    time.sleep(2 * (attempt + 1)); continue
                r.raise_for_status()
                break
            except Exception:
                if attempt == 3:
                    return out
                time.sleep(2)
        results = r.json().get("results", [])
        out.extend(norm_event(e) for e in results if (e.get("location_coordinates") or {}).get("lat"))
        if len(results) < 100:
            break
        offset += 100
        time.sleep(0.5)
    return out


def match_events(asso_name, city, nearby, cap) -> list[dict]:
    """nearby = [(distKm, event)] trié par distance. Sépare matchés (nom) / proximité."""
    strong_tok = {t for t in (tokens(asso_name) - tokens(city or "")) if len(t) >= 5}
    matched, others = [], []
    for dist, ev in nearby:
        common = strong_tok & tokens(ev["_text"])
        rec = {k: v for k, v in ev.items() if not k.startswith("_")}
        rec["distKm"] = round(dist, 1)
        (matched if len(common) >= 2 else others).append(rec)
    out = [{**r, "matchedAsso": True} for r in matched]
    for r in others:
        if len(out) >= cap:
            break
        out.append({**r, "matchedAsso": False})
    return out[:cap]


def fetch_assos(conn, limit, max_age, redo):
    cond = "location IS NOT NULL"
    if not redo:
        cond += (" AND (NOT (meta ? 'eventsScrapedAt') OR (meta->>'eventsScrapedAt')::timestamptz "
                 " < now() - make_interval(days => %(maxage)s))")
    lim = "" if limit is None else f"LIMIT {int(limit)}"
    rows = conn.execute(
        f"""SELECT id, name, city, ST_Y(location::geometry), ST_X(location::geometry)
            FROM associations WHERE {cond} ORDER BY id {lim}""",
        {"maxage": max_age},
    ).fetchall()
    return [(str(r[0]), r[1], r[2], float(r[3]), float(r[4])) for r in rows]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=None, help="nb d'assos à traiter")
    ap.add_argument("--radius", type=float, default=12, help="rayon d'attachement (km)")
    ap.add_argument("--max-age", type=int, default=3)
    ap.add_argument("--cap", type=int, default=6)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--redo", action="store_true")
    args = ap.parse_args()

    with psycopg.connect(DSN, autocommit=False) as conn:
        assos = fetch_assos(conn, args.limit, args.max_age, args.redo)
        print(f"SCRAP 8 — events : {len(assos)} assos à (ré)assigner "
              f"(radius={args.radius}km, dry-run={args.dry_run}).", flush=True)
        if not assos:
            print("rien à faire.", flush=True); return 0

        with httpx.Client(headers={"User-Agent": "GemensKarte/1.0"}) as client:
            events = fetch_all_events(client)
        print(f"  {len(events)} événements à venir récupérés (≈{(len(events)//100)+1} appels API).", flush=True)

        ts = datetime.now(timezone.utc).isoformat(timespec="seconds")
        n_with = n_matched = 0
        for i, (aid, aname, city, lat, lon) in enumerate(assos, 1):
            nearby = []
            for ev in events:
                d = haversine(lat, lon, ev["_lat"], ev["_lon"])
                if d <= args.radius:
                    nearby.append((d, ev))
            nearby.sort(key=lambda x: x[0])
            evs = match_events(aname, city, nearby, args.cap)
            if evs:
                n_with += 1
            n_matched += sum(1 for e in evs if e["matchedAsso"])
            if not args.dry_run:
                conn.execute(
                    "UPDATE associations SET meta = meta || %s::jsonb WHERE id = %s",
                    (json.dumps({"events": evs, "eventsScrapedAt": ts}), aid),
                )
                if i % 500 == 0:
                    conn.commit()
                    print(f"  …{i}/{len(assos)} assos | avec agenda={n_with}", flush=True)
        if not args.dry_run:
            conn.commit()

        print(f"\nSCRAP 8 fini : {len(assos)} assos | {n_with} avec agenda | "
              f"{n_matched} événements matchés à l'asso", flush=True)
    return 0


if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
    sys.exit(main())
