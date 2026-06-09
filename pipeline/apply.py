"""SCRAP 4 — Apply & route (DB pur, zéro réseau) -> social{} + meta.quarantine

Consomme meta.discovery (priors / match_type) + meta.verification (verdicts LLM) et :
  - calcule un score de confiance global par candidat ;
  - REBÂTIT la colonne `social` à partir des seuls candidats à confiance haute ;
  - met les candidats douteux dans meta.quarantine (revue humaine) ;
  - jette le reste (tracé dans meta.dropped pour audit).

Archive l'ancien `social` + meta.enrichment dans meta.legacy (une seule fois) avant de réécrire.

Déterministe et rejouable : relancer recalcule tout depuis discovery+verification.

Usage:
  python apply.py [--limit N] [--dept 85] [--dry-run]
                  [--apply-th 0.75] [--quar-th 0.40]
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone

import psycopg

DSN = os.environ.get(
    "DATABASE_URL", "postgres://gemenskarte:gemenskarte@localhost:5433/gemenskarte"
)

# Prior de confiance par match_type (réseaux sociaux).
PRIOR = {
    "slug": 0.90, "top1": 0.70, "slug_sub": 0.60, "slug_city": 0.55,
    "top2": 0.50, "top3": 0.35, "title": 0.30, "fallback": 0.10,
}


def site_prior(score: int) -> float:
    if score >= 6:
        return 0.80
    if score >= 4:
        return 0.50
    if score >= 2:
        return 0.30
    return 0.15


def social_score(match_type: str, conf: float) -> float:
    return round(0.35 * PRIOR.get(match_type, 0.2) + 0.65 * conf, 3)


def website_score(disc_score: int, conf: float) -> float:
    # le LLM a lu la VRAIE page -> il pèse plus lourd.
    return round(0.25 * site_prior(disc_score) + 0.75 * conf, 3)


def is_confirmed_dead(health: dict, plat: str, url: str) -> bool:
    """Vrai si liveness.py a confirmé le lien mort (>=2 échecs consécutifs) sur CETTE url."""
    rec = (health or {}).get(plat) or {}
    return (rec.get("status") == "dead"
            and rec.get("url") == url
            and int(rec.get("consecutiveFailures", 0)) >= 2)


def route(asso: dict, apply_th: float, quar_th: float) -> dict:
    disc = asso["discovery"] or {}
    ver = (asso["verification"] or {}).get("results", {})
    health = asso.get("link_health") or {}

    # index match_type/disc_score par url
    soc_mt = {c["url"]: c.get("match_type", "fallback") for c in disc.get("socialCandidates", [])}
    site_sc = {c["url"]: c.get("score", 0) for c in disc.get("websiteCandidates", [])}

    social: dict[str, str] = {}
    quarantine: dict[str, dict] = {}
    dropped: list[dict] = []

    # HelloAsso legacy = tier FIABLE : on le reporte tel quel s'il existait déjà, même
    # si la découverte DDG ne l'a pas re-trouvé (sinon on perd de bons liens vérifiés).
    # Source = legacy (état d'origine) en priorité, sinon le social courant (1er passage).
    legacy_social = asso.get("legacy_social") or asso.get("social_old") or {}
    if legacy_social.get("helloasso"):
        social["helloasso"] = legacy_social["helloasso"]
    # HelloAsso trouvé par la passe dédiée (helloasso.py) = fiable → toujours conservé.
    if asso.get("helloasso_found"):
        social["helloasso"] = asso["helloasso_found"]

    for key, v in ver.items():
        url = v.get("url")
        verdict = v.get("verdict")
        conf = float(v.get("confidence", 0))
        trusted = bool(v.get("trusted"))

        if key == "website":
            score = 1.0 if trusted else website_score(site_sc.get(url, 0), conf)
        else:
            score = 1.0 if trusted else social_score(soc_mt.get(url, "fallback"), conf)

        rec = {"url": url, "score": score, "reason": v.get("reason", ""), "verdict": verdict}

        if trusted or (verdict != "drop" and score >= apply_th):
            social[key] = url
        elif verdict != "drop" and score >= quar_th:
            quarantine[key] = rec
        else:
            dropped.append({"platform": key, **rec})

    # Gate liveness : un lien retenu mais confirmé MORT (>=2 échecs HTTP, liveness.py)
    # est retiré de social -> dropped. Ne s'applique qu'à website/helloasso (les seuls
    # vérifiables par HTTP ; FB/IG/LI ne sont jamais marqués 'dead' par liveness).
    for plat in ("website", "helloasso"):
        if plat in social and is_confirmed_dead(health, plat, social[plat]):
            dropped.append({"platform": plat, "url": social.pop(plat),
                            "score": 0.0, "verdict": "dead",
                            "reason": "lien mort confirmé (HTTP, >=2 échecs)"})
            quarantine.pop(plat, None)

    return {"social": social, "quarantine": quarantine, "dropped": dropped}


def fetch_pending(conn, limit, dept):
    conds = ["(meta -> 'verification' ->> 'model') IS NOT NULL"]
    if dept:
        conds.append("department = %(dept)s")
    where = " AND ".join(conds)
    lim = "" if limit is None else f"LIMIT {int(limit)}"
    rows = conn.execute(
        f"""SELECT id, name, social, meta->'discovery', meta->'verification',
                   (meta ? 'legacy') AS has_legacy, meta->'enrichment',
                   meta->'legacy'->'social', meta->>'helloassoFound', meta->'linkHealth'
            FROM associations WHERE {where} ORDER BY id {lim}""",
        {"dept": dept},
    ).fetchall()
    return [{"id": str(r[0]), "name": r[1], "social_old": r[2], "discovery": r[3],
             "verification": r[4], "has_legacy": r[5], "enrichment": r[6],
             "legacy_social": r[7], "helloasso_found": r[8], "link_health": r[9]} for r in rows]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--dept", default=None)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--apply-th", type=float, default=0.75)
    ap.add_argument("--quar-th", type=float, default=0.40)
    args = ap.parse_args()

    with psycopg.connect(DSN, autocommit=False) as conn:
        batch = fetch_pending(conn, args.limit, args.dept)
        total = len(batch)
        print(f"SCRAP 4 — à appliquer : {total} assos "
              f"(apply>={args.apply_th}, quar>={args.quar_th}, dry-run={args.dry_run}).", flush=True)

        n_app = n_quar = n_drop = 0
        ts = datetime.now(timezone.utc).isoformat(timespec="seconds")
        for i, asso in enumerate(batch, 1):
            r = route(asso, args.apply_th, args.quar_th)
            n_app += len(r["social"])
            n_quar += len(r["quarantine"])
            n_drop += len(r["dropped"])

            meta_patch = {
                "quarantine": r["quarantine"],
                "dropped": r["dropped"],
                "applyAt": ts,
            }
            # archive legacy une seule fois
            if not asso["has_legacy"]:
                meta_patch["legacy"] = {
                    "social": asso["social_old"], "enrichment": asso["enrichment"],
                }

            if not args.dry_run:
                conn.execute(
                    "UPDATE associations SET social = %s::jsonb, meta = meta || %s::jsonb WHERE id = %s",
                    (json.dumps(r["social"]), json.dumps(meta_patch), asso["id"]),
                )
                conn.commit()

            if r["social"] or r["quarantine"]:
                print(f"  [{i}/{total}] {asso['name'][:34]:34} "
                      f"apply={list(r['social']) or '-'} quar={list(r['quarantine']) or '-'}", flush=True)

        print(f"\nSCRAP 4 fini : {total} assos | liens appliqués={n_app} "
              f"quarantaine={n_quar} jetés={n_drop}", flush=True)
    return 0


if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
    sys.exit(main())
