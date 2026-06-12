-- Suivi de fréquentation, anonyme et sans cookie.
-- On ne stocke JAMAIS l'IP : seulement un hash quotidien (IP+navigateur+jour+sel),
-- qui permet de compter les visiteurs uniques par jour sans identifier personne.
CREATE TABLE IF NOT EXISTS visits (
  id      bigserial PRIMARY KEY,
  ts      timestamptz NOT NULL DEFAULT now(),
  kind    text NOT NULL,        -- 'page' | 'region'
  path    text,                 -- chemin de page (kind='page')
  dept    text,                 -- code département consulté (kind='region')
  visitor text NOT NULL         -- hash anonyme du visiteur (pas d'IP en clair)
);
CREATE INDEX IF NOT EXISTS visits_ts_idx ON visits (ts);
CREATE INDEX IF NOT EXISTS visits_dept_idx ON visits (dept) WHERE dept IS NOT NULL;
