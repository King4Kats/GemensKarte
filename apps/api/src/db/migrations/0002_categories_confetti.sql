-- Aligne les catégories sur la palette "confetti" de la direction artistique
-- (Claude Design). Converge les bases déjà migrées avec l'ancien jeu de catégories.

-- 1) Nouvelles catégories (idempotent)
INSERT INTO categories (id, label, emoji, color, color_soft) VALUES
  ('eco',    'Écologie',   '🌱', '#00d68f', '#E3FAF2'),
  ('cult',   'Culture',    '🎭', '#ff2d78', '#FFE6EF'),
  ('sport',  'Sport',      '⚽', '#ffc300', '#FFF6D9'),
  ('social', 'Social',     '🤝', '#2b59ff', '#E6ECFF'),
  ('soli',   'Solidarité', '🧡', '#ff5c35', '#FFE9E2'),
  ('edu',    'Éducation',  '🎓', '#7b3ff2', '#EFE7FD')
ON CONFLICT (id) DO UPDATE
  SET label = EXCLUDED.label, emoji = EXCLUDED.emoji,
      color = EXCLUDED.color, color_soft = EXCLUDED.color_soft;

-- 2) Remappe les associations de l'ancien vers le nouveau jeu d'ids
UPDATE associations SET category_id = 'cult' WHERE category_id = 'culture';
UPDATE associations SET category_id = 'edu'  WHERE category_id = 'jeunesse';
UPDATE associations SET category_id = 'soli' WHERE category_id = 'sante';

-- 3) Supprime les anciennes catégories devenues inutilisées
DELETE FROM categories WHERE id IN ('culture', 'jeunesse', 'sante');
