"""Stats de progression / contrôle du pipeline. Lecture seule."""
import os, psycopg
DSN = os.environ.get("DATABASE_URL", "postgres://gemenskarte:gemenskarte@localhost:5433/gemenskarte")
Q = {
    "total": "select count(*) from associations",
    "discovery": "select count(*) from associations where meta ? 'discovery'",
    "verification": "select count(*) from associations where meta ? 'verification'",
    "applied (applyAt)": "select count(*) from associations where meta ? 'applyAt'",
    "disc. avec social cand": "select count(*) from associations where jsonb_array_length(meta->'discovery'->'socialCandidates') > 0",
    "disc. avec site cand": "select count(*) from associations where jsonb_array_length(meta->'discovery'->'websiteCandidates') > 0",
    "social facebook (actuel)": "select count(*) from associations where social ? 'facebook'",
    "social website (actuel)": "select count(*) from associations where social ? 'website'",
    "quarantaine non vide": "select count(*) from associations where meta->'quarantine' <> '{}'::jsonb",
    "linkHealth calculé": "select count(*) from associations where meta ? 'linkHealth'",
    "  dont 1+ lien dead": "select count(*) from associations where meta->'linkHealth'->'website'->>'status'='dead' or meta->'linkHealth'->'helloasso'->>'status'='dead'",
    "liens morts retirés (deadRemoved)": "select coalesce(sum(jsonb_array_length(meta->'deadRemoved')),0) from associations where meta ? 'deadRemoved'",
    "qualityScore calculé": "select count(*) from associations where meta ? 'qualityScore'",
    "agenda à venir (events>0)": "select count(*) from associations where jsonb_array_length(coalesce(meta->'events','[]'::jsonb))>0",
    "  dont event matché asso": "select count(*) from associations where exists (select 1 from jsonb_array_elements(coalesce(meta->'events','[]'::jsonb)) e where (e->>'matchedAsso')::bool)",
}
TIERS = "select meta->'qualityScore'->>'tier' t, count(*) from associations where meta ? 'qualityScore' group by 1 order by 1"
with psycopg.connect(DSN) as c:
    for label, q in Q.items():
        print(f"{label:34} {c.execute(q).fetchone()[0]}")
    rows = c.execute(TIERS).fetchall()
    if rows:
        avg = c.execute("select round(avg((meta->'qualityScore'->>'score')::int),1) from associations where meta ? 'qualityScore'").fetchone()[0]
        print(f"{'tiers qualité (moy '+str(avg)+')':34} " + "  ".join(f"{t}={n}" for t, n in rows))
