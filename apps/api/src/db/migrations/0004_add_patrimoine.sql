-- Ajoute la 7e catégorie "Patrimoine" (présente dans @gemenskarte/shared et utilisée par
-- le classifieur, mais absente du seed initial 0002 -> violation de FK à l'import + /categories
-- renvoyait 7 alors que la table n'en avait que 6). Idempotent.
INSERT INTO categories (id, label, emoji, color, color_soft) VALUES
  ('patri', 'Patrimoine', '🏛️', '#B07A1C', '#FAF3E0')
ON CONFLICT (id) DO UPDATE SET
  label = EXCLUDED.label, emoji = EXCLUDED.emoji,
  color = EXCLUDED.color, color_soft = EXCLUDED.color_soft;
