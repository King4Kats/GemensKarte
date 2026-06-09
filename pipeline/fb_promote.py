"""SCRAP 9b — Vérifie & promeut les sites CANDIDATS trouvés via Facebook (meta.fbWebsite).

fb_website.py collecte un domaine candidat depuis le snippet DDG de la page FB. Ce script le
VÉRIFIE par LLM (réutilise verify_llm.judge_website : fetch + readability + jugement Ollama
« ce site est-il bien celui de CETTE asso ? ») et, si confirmé (keep, confiance >= seuil),
le PROMEUT dans la colonne curée `website` — couche prioritaire à l'affichage, JAMAIS
reconstruite par apply (donc promotion sûre et permanente ; liveness/reaper l'enlèveront s'il
meurt un jour). Sinon, on marque seulement la fiche comme examinée (pas de promotion).

Idempotent : gating meta.fbWebsitePromotedAt. Ne promeut jamais sur une fiche qui a déjà un site.

Usage: python fb_promote.py [--limit N] [--dry-run] [--min-conf 0.7] [--model qwen3.5:27b]
"""
from __future__ import annotations
import os, json, argparse, sys
from datetime import datetime, timezone
import psycopg
from ollama import Client
from verify_llm import judge_website, OLLAMA_HOST, DEFAULT_MODEL

DSN = os.environ.get("DATABASE_URL", "postgres://gemenskarte:gemenskarte@localhost:5433/gemenskarte")

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=50)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--min-conf", type=float, default=0.7)
    ap.add_argument("--model", default=DEFAULT_MODEL)
    args = ap.parse_args()
    client = Client(host=OLLAMA_HOST)
    ts = datetime.now(timezone.utc).isoformat(timespec="seconds")
    with psycopg.connect(DSN, autocommit=False) as c:
        rows = c.execute(
            """SELECT id, name, city, department, description, meta->'fbWebsite'->>'url'
               FROM associations
               WHERE meta ? 'fbWebsite' AND (meta->'fbWebsite'->>'url') IS NOT NULL
                 AND NOT (meta ? 'fbWebsitePromotedAt')
                 AND coalesce(website, social->>'website') IS NULL
               ORDER BY id LIMIT %s""", (args.limit,)).fetchall()
        print(f"Candidats FB->site à vérifier : {len(rows)} (min-conf={args.min_conf}, dry-run={args.dry_run})", flush=True)
        n_promo = n_rej = 0
        for aid, name, city, dept, desc, url in rows:
            asso = {"name": name, "city": city, "department": dept, "description": desc}
            try:
                v = judge_website(client, args.model, asso, {"url": url})
            except Exception as e:
                print(f"  {name[:34]:34} ERR {type(e).__name__}", flush=True); continue
            keep = v.get("verdict") == "keep" and float(v.get("confidence", 0)) >= args.min_conf
            patch = {"fbWebsitePromotedAt": ts,
                     "fbWebsite": {"url": url, "verified": keep, "confidence": v.get("confidence"),
                                   "verdict": v.get("verdict"), "reason": v.get("reason")}}
            if keep:
                n_promo += 1
                print(f"  ✔ PROMU {name[:30]:30} -> {url}  (conf {v.get('confidence')})", flush=True)
                if not args.dry_run:
                    c.execute("UPDATE associations SET website=%s, meta=meta||%s::jsonb WHERE id=%s",
                              (url, json.dumps(patch), aid)); c.commit()
            else:
                n_rej += 1
                print(f"  · rejeté {name[:30]:30} ({v.get('verdict')} {v.get('confidence')})", flush=True)
                if not args.dry_run:
                    c.execute("UPDATE associations SET meta=meta||%s::jsonb WHERE id=%s",
                              (json.dumps(patch), aid)); c.commit()
        print(f"\nFini : {n_promo} promus | {n_rej} rejetés", flush=True)

if __name__ == "__main__":
    try: sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception: pass
    main()
