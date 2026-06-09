import os, psycopg
dsn=os.environ.get("DATABASE_URL","postgres://gemenskarte:gemenskarte@localhost:5433/gemenskarte")
with psycopg.connect(dsn) as c:
    r=c.execute("""
      SELECT count(*),
             min((meta->>'discoveryAt')::timestamptz),
             max((meta->>'discoveryAt')::timestamptz)
      FROM associations WHERE meta ? 'discoveryAt'
        AND (meta->>'discoveryAt')::timestamptz > now() - interval '2 hours'
    """).fetchone()
    n, lo, hi = r
    if n and lo and hi and hi>lo:
        span=(hi-lo).total_seconds()
        print(f"{n} découvertes sur {span/60:.1f} min  =>  {span/n:.1f} s/asso  ({n/span*60:.1f}/min)")
        remaining=18554-c.execute("select count(*) from associations where meta ? 'discovery'").fetchone()[0]
        print(f"restant: {remaining} => ETA ~{remaining*(span/n)/3600:.1f} h")
    else:
        print("pas assez de données", r)
