#!/usr/bin/env bash
# Met en place l'environnement de dev complet : infra, schéma, données, index.
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f .env ] || cp .env.example .env

echo "▶️  Infra (PostGIS + Meilisearch)…"
pnpm infra:up

echo "▶️  Types partagés…"
pnpm --filter @gemenskarte/shared build

echo "▶️  Migrations + seed…"
pnpm db:migrate
pnpm db:seed

# Données RNA réelles si le fichier a été récupéré (workflow fetch-rna)
if [ -f data/rna/rna_covered.csv.gz ]; then
  echo "▶️  Import RNA (échantillon 5000, sans géocodage)…"
  pnpm import:rna -- --file data/rna/rna_covered.csv.gz --no-geocode --limit 5000
fi

echo "▶️  Indexation Meilisearch…"
pnpm search:reindex

echo "✅ Prêt. Lance l'API avec : pnpm dev:api"
