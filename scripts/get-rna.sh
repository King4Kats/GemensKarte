#!/usr/bin/env bash
# Télécharge le fichier RNA courant (périmètre couvert) dans data/rna/.
#
# Le fichier est volumineux (> 80 Mo) : il n'est PAS versionné dans le dépôt
# (limite GitHub : 100 Mo/fichier). Il est publié en Release asset par le
# workflow .github/workflows/fetch-rna.yml (tag « rna-latest ») et récupéré ici.
#
# Usage : bash scripts/get-rna.sh        (avant `pnpm import:rna`)
set -euo pipefail

REPO="${RNA_REPO:-King4Kats/GemensKarte}"
TAG="${RNA_TAG:-rna-latest}"
OUT="data/rna/rna_france.csv.gz"
URL="https://github.com/$REPO/releases/download/$TAG/rna_france.csv.gz"

mkdir -p data/rna
echo "Téléchargement du RNA depuis la Release $TAG…"
echo "  $URL"
# Dépôt public → pas d'auth nécessaire. -L suit la redirection vers le CDN.
curl -fSL --retry 3 "$URL" -o "$OUT"
echo "OK : $OUT ($(du -h "$OUT" | cut -f1))"
