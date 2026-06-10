"""SCRAP 7 — Score qualité / fraîcheur par fiche (DB pur, zéro réseau) -> meta.qualityScore

Agrège tout ce que le pipeline sait d'une fiche en un score 0-100 + un tier (A/B/C/D) +
des flags lisibles (ce qui manque / est périmé). Sert à :
  - afficher un badge qualité sur la fiche ;
  - trier / prioriser la re-vérification (plus bas score = re-queue en premier) ;
  - mesurer la progression globale de la base.

4 axes (poids en tête, tunables) :
  COVERAGE     présence website / réseau social / helloasso
  VERIFICATION jugée par NOTRE modèle (vs legacy vs absente) + confiance moyenne des liens
  HEALTH       liens servis vivants (liveness) ; pénalité mort en attente / quarantaine
  FRESHNESS    âge verification / liveness / presse + présence d'articles

Déterministe et idempotent. Gating : ne recalcule que si un marqueur d'entrée
(verifiedAt / linkHealthAt / applyAt / pressFilteredAt / discoveryAt) est plus récent que
qualityComputedAt (sinon rien à refaire).

Usage:
  python score.py [--limit N] [--dept 85] [--dry-run] [--all]
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

# --- Barème (somme des maxima = 100) -----------------------------------------
W = {
    "website": 15, "social": 12, "helloasso": 8,          # COVERAGE (35)
    "verif_model": 15, "verif_conf": 10,                  # VERIFICATION (25)
    "health_clean": 14, "health_allalive": 6,             # HEALTH (20)
    # FRESHNESS (20) : verif + liveness + presse + AGENDA À VENIR (vitalité)
    "fresh_verif": 7, "fresh_health": 5, "fresh_press": 2, "has_press": 2, "fresh_events": 4,
}
SOCIAL_KEYS = ("facebook", "instagram", "linkedin")


def _age_days(ts: str | None, now: datetime) -> float | None:
    if not ts:
        return None
    try:
        return (now - datetime.fromisoformat(ts.replace("Z", "+00:00"))).total_seconds() / 86400
    except (ValueError, TypeError):
        return None


def _decay(age: float | None, full: float, zero: float) -> float:
    """1.0 si age<=full, 0.0 si age>=zero, linéaire entre les deux. None -> 0."""
    if age is None:
        return 0.0
    if age <= full:
        return 1.0
    if age >= zero:
        return 0.0
    return (zero - age) / (zero - full)


def compute(asso: dict, now: datetime) -> dict:
    social = asso["social"] or {}
    website = asso["website"]
    ver = asso["verification"] or {}
    ver_model = (ver or {}).get("model")
    ver_results = (ver or {}).get("results", {}) or {}
    health = asso["linkHealth"] or {}
    flags: list[str] = []
    pts = 0.0

    has_website = bool(website or social.get("website"))
    has_social = any(social.get(k) for k in SOCIAL_KEYS)
    has_ha = bool(social.get("helloasso"))
    # A-t-elle au moins UN lien ? Sert à ne pas créditer une fiche totalement vide pour
    # de la "vérif faite" / "pas de lien mort" / "fraîcheur" — sinon elle monte à tort.
    has_any_link = has_website or has_social or has_ha

    # --- COVERAGE
    if has_website:
        pts += W["website"]
    else:
        flags.append("no_website")
    if has_social:
        pts += W["social"]
    else:
        flags.append("no_social")
    if has_ha:
        pts += W["helloasso"]
    else:
        flags.append("no_helloasso")

    # --- VERIFICATION
    # On ne crédite la vérification QUE si la fiche a au moins un lien : "vérifié mais tout
    # droppé" (fiche vide) ne doit pas rapporter de points de qualité.
    if ver_model:
        if has_any_link:
            pts += W["verif_model"]
    elif ver:
        if has_any_link:
            pts += W["verif_model"] * 0.45
        flags.append("verif_legacy")
    else:
        flags.append("verif_missing")
    # confiance moyenne des liens effectivement servis et jugés keep
    served = [k for k in (*SOCIAL_KEYS, "website") if social.get(k) or (k == "website" and website)]
    confs = [float(ver_results[k].get("confidence", 0))
             for k in served if k in ver_results and ver_results[k].get("verdict") == "keep"]
    if confs:
        pts += W["verif_conf"] * (sum(confs) / len(confs))

    # --- HEALTH
    served_health = [health.get(k) for k in ("website", "helloasso") if health.get(k)]
    if served_health:
        statuses = [h.get("status") for h in served_health]
        has_dead = any(s == "dead" for s in statuses)
        all_alive = all(s == "alive" for s in statuses)
        if has_dead:
            flags.append("dead_link_pending")
        else:
            pts += W["health_clean"]
        if all_alive:
            pts += W["health_allalive"]
    elif has_website or has_ha:
        # liens servables existants mais pas encore checkés : neutre (moitié) pour ne pas
        # punir l'attente de liveness.
        pts += (W["health_clean"] + W["health_allalive"]) * 0.5
        flags.append("health_unchecked")
    else:
        # aucun lien testable -> 0 point santé (ne pas créditer une fiche vide de
        # "pas de lien mort" : elle n'a simplement aucun lien).
        flags.append("no_link")
    if asso["quarantine"] and asso["quarantine"] != {}:
        flags.append("has_quarantine")

    # --- FRESHNESS
    age_verif = _age_days(ver.get("ts"), now)
    age_health = _age_days(asso["linkHealthAt"], now)
    age_press = _age_days(asso["pressScrapedAt"], now)
    # Fraîcheur vérif/santé : seulement si la fiche a des liens (rien à "rafraîchir" sinon).
    if has_any_link:
        pts += W["fresh_verif"] * _decay(age_verif, 90, 365)
        pts += W["fresh_health"] * _decay(age_health, 21, 90)
    pts += W["fresh_press"] * _decay(age_press, 60, 365)
    if asso["pressCount"] and asso["pressCount"] > 0:
        pts += W["has_press"]
    else:
        flags.append("no_press")
    # agenda à venir = signal de vitalité (au moins un événement encore futur).
    events = asso["events"] or []
    now_iso = now.isoformat()
    upcoming = [e for e in events if (e.get("start") or "") >= now_iso]
    if upcoming:
        pts += W["fresh_events"]
        flags.append("has_agenda")
        if any(e.get("matchedAsso") for e in upcoming):
            flags.append("agenda_asso")
    if age_verif is not None and age_verif > 180:
        flags.append("stale_verif")

    score = max(0, min(100, round(pts)))
    tier = "A" if score >= 80 else "B" if score >= 60 else "C" if score >= 40 else "D"
    return {"score": score, "tier": tier, "flags": flags,
            "computedAt": now.isoformat(timespec="seconds")}


def fetch_pending(conn, limit, dept, do_all):
    conds = []
    if not do_all:
        # recalcul si une entrée a bougé depuis le dernier calcul (ou jamais calculé).
        conds.append(
            "(NOT (meta ? 'qualityComputedAt') OR (meta->>'qualityComputedAt') < GREATEST("
            " coalesce(meta->'verification'->>'ts',''), coalesce(meta->>'linkHealthAt',''),"
            " coalesce(meta->>'applyAt',''), coalesce(meta->>'pressFilteredAt',''),"
            " coalesce(meta->>'eventsScrapedAt',''), coalesce(meta->>'discoveryAt','')))"
        )
    if dept:
        conds.append("department = %(dept)s")
    where = ("WHERE " + " AND ".join(conds)) if conds else ""
    lim = "" if limit is None else f"LIMIT {int(limit)}"
    rows = conn.execute(
        f"""SELECT id, name, social, website, meta->'verification',
                   meta->'linkHealth', meta->>'linkHealthAt',
                   meta->>'pressScrapedAt', jsonb_array_length(coalesce(meta->'pressArticles','[]'::jsonb)),
                   meta->'quarantine', meta->'events'
            FROM associations {where} ORDER BY id {lim}""",
        {"dept": dept},
    ).fetchall()
    return [{"id": str(r[0]), "name": r[1], "social": r[2], "website": r[3],
             "verification": r[4], "linkHealth": r[5], "linkHealthAt": r[6],
             "pressScrapedAt": r[7], "pressCount": r[8], "quarantine": r[9],
             "events": r[10]} for r in rows]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--dept", default=None)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--all", action="store_true", help="recalcule tout (ignore le gating)")
    args = ap.parse_args()

    with psycopg.connect(DSN, autocommit=False) as conn:
        batch = fetch_pending(conn, args.limit, args.dept, args.all)
        total = len(batch)
        print(f"SCRAP 7 — score : {total} fiches (dry-run={args.dry_run}).", flush=True)

        now = datetime.now(timezone.utc)
        tiers = {"A": 0, "B": 0, "C": 0, "D": 0}
        ssum = 0
        for i, asso in enumerate(batch, 1):
            q = compute(asso, now)
            tiers[q["tier"]] += 1
            ssum += q["score"]
            if not args.dry_run:
                conn.execute(
                    "UPDATE associations SET meta = meta || %s::jsonb WHERE id = %s",
                    (json.dumps({"qualityScore": q, "qualityComputedAt": q["computedAt"]}), asso["id"]),
                )
                # commit par lots : 1 aller-retour réseau / 500 fiches (vs 1/fiche).
                if i % 500 == 0:
                    conn.commit()
        if not args.dry_run:
            conn.commit()

        avg = round(ssum / total, 1) if total else 0
        print(f"\nSCRAP 7 fini : {total} fiches | moyenne={avg} | "
              f"A={tiers['A']} B={tiers['B']} C={tiers['C']} D={tiers['D']}", flush=True)
    return 0


if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
    sys.exit(main())
