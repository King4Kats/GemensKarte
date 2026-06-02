-- GemensKarte — schéma initial (PostGIS + recherche trigram)

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Catégories "confetti"
CREATE TABLE IF NOT EXISTS categories (
  id          text PRIMARY KEY,
  label       text NOT NULL,
  emoji       text NOT NULL,
  color       text NOT NULL,
  color_soft  text NOT NULL
);

-- Associations
CREATE TABLE IF NOT EXISTS associations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rna_id        text UNIQUE,
  name          text NOT NULL,
  slug          text,
  category_id   text REFERENCES categories(id),
  description   text,
  email         text,
  phone         text,
  website       text,
  address       text,
  postal_code   text,
  city          text,
  department    text,
  region        text,
  location      geometry(Point, 4326),
  social        jsonb NOT NULL DEFAULT '{}'::jsonb,
  tags          text[] NOT NULL DEFAULT '{}',
  status        text NOT NULL DEFAULT 'published',
  source        text NOT NULL DEFAULT 'manual',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Index spatial (requêtes "assos dans cette zone" + tri distance)
CREATE INDEX IF NOT EXISTS assoc_location_gix ON associations USING gist (location);
-- Recherche par nom tolérante (trigram)
CREATE INDEX IF NOT EXISTS assoc_name_trgm   ON associations USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS assoc_category_idx ON associations (category_id);
CREATE INDEX IF NOT EXISTS assoc_department_idx ON associations (department);
CREATE INDEX IF NOT EXISTS assoc_status_idx  ON associations (status);

-- Seed des catégories (source de vérité côté @gemenskarte/shared)
INSERT INTO categories (id, label, emoji, color, color_soft) VALUES
  ('eco',      'Écologie', '🌱', '#19C37D', '#E4F8EF'),
  ('culture',  'Culture',  '🎭', '#EC2D8A', '#FCE3F0'),
  ('sport',    'Sport',    '⚽', '#FFB020', '#FFF3DA'),
  ('social',   'Social',   '🤝', '#3B6BFF', '#E5ECFF'),
  ('jeunesse', 'Jeunesse', '🎓', '#8B5CF6', '#EFE9FE'),
  ('sante',    'Santé',    '❤️', '#FF6B57', '#FFE9E5')
ON CONFLICT (id) DO NOTHING;
