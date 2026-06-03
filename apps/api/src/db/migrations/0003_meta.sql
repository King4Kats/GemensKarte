-- Champ libre pour les métadonnées riches d'une fiche (démo / saisie manuelle) :
-- blurb court, nombre de membres, année de création, besoin du moment, libellé du CTA.
-- Les imports RNA le laissent vide ({}), la fiche s'adapte.
ALTER TABLE associations ADD COLUMN IF NOT EXISTS meta jsonb NOT NULL DEFAULT '{}'::jsonb;
