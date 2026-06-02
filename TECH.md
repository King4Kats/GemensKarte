# GemensKarte — Architecture technique

Backend et intégrations de **GemensKarte**, la carte des associations de
l'Ouest (Bretagne, Pays de la Loire, Normandie).

> La **direction artistique / le front** sont traités à part. Ce document
> couvre l'**API, la base de données géographique, la recherche et l'import
> de données**.

## Stack

| Couche | Choix |
|---|---|
| Langage | **TypeScript** de bout en bout |
| API | **NestJS** (REST, `/api`) |
| Base de données | **PostgreSQL 16 + PostGIS** (géométries, index spatial GiST) |
| Accès données | **Drizzle ORM** + SQL brut pour les requêtes PostGIS |
| Recherche | **Meilisearch** (autocomplétion tolérante aux fautes) |
| Validation / types | **Zod**, schémas partagés via `@gemenskarte/shared` |
| Géocodage | **Base Adresse Nationale** (open data) |
| Données assos | Import **RNA** (Répertoire National des Associations) |
| Dev | **Docker Compose** (Postgres+PostGIS, Meilisearch) |

## Monorepo (pnpm workspaces)

```
packages/shared      Types + schémas Zod + catégories "confetti" (front+back)
apps/api             API NestJS
  src/config         Chargement + validation des variables d'env (Zod)
  src/db             Schéma Drizzle, migrations SQL, migrate/seed
  src/geo            Géocodeur BAN + mapping départements → régions
  src/search         Module Meilisearch (autocomplétion) + réindexation
  src/categories     Endpoint des catégories
  src/associations   Endpoints liste / carte (GeoJSON) / fiche / référencement
  src/import/rna      Pipeline d'import du RNA (CSV → géocodage → upsert)
```

## Démarrage

```bash
cp .env.example .env
pnpm install

# 1. Infra (Postgres+PostGIS + Meilisearch)
pnpm infra:up

# 2. Types partagés
pnpm --filter @gemenskarte/shared build

# 3. Base de données
pnpm db:migrate      # crée le schéma + les catégories
pnpm db:seed         # 8 associations de démo (Nantes)

# 4. (option) données réelles RNA — échantillon embarqué, hors-ligne
pnpm import:rna -- --sample

# 5. Recherche
pnpm search:reindex  # indexe les assos dans Meilisearch

# 6. API
pnpm dev:api         # http://localhost:3000/api
```

## Endpoints

| Méthode | Route | Description |
|---|---|---|
| GET | `/api/health` | Ping |
| GET | `/api/categories` | Catégories confetti (couleur + emoji) |
| GET | `/api/associations` | Liste filtrée : `?q=&category=&department=&bbox=minLng,minLat,maxLng,maxLat&near=lng,lat&page=&limit=` |
| GET | `/api/associations/geojson` | FeatureCollection (pins de la carte) |
| GET | `/api/associations/:id` | Fiche complète |
| POST | `/api/associations` | Référencement public (statut `pending`, géocodé) |
| GET | `/api/search/suggest` | Autocomplétion : `?q=&limit=` |

### Exemples

```bash
# Assos dans la zone visible de la carte, triées par proximité d'un point
curl "http://localhost:3000/api/associations?bbox=-1.7,47.1,-1.4,47.3&near=-1.55,47.21"

# Carte (GeoJSON) filtrée par catégorie
curl "http://localhost:3000/api/associations/geojson?category=eco"

# Autocomplétion
curl "http://localhost:3000/api/search/suggest?q=theat"
```

## Import RNA — comment ça marche

`apps/api/src/import/rna` :
1. **Parse** le CSV waldec du RNA (séparateur `;`).
2. **Classe** chaque asso dans une catégorie confetti par mots-clés
   (`classifier.ts`) — le RNA n'a pas de catégorie exploitable directement.
3. **Géocode** l'adresse via la Base Adresse Nationale (ou utilise des colonnes
   `lat`/`lng` si présentes, comme dans l'échantillon hors-ligne).
4. **Upsert** par `rna_id` (idempotent).

```bash
# Télécharger un dump départemental sur data.gouv.fr (Répertoire National
# des Associations / waldec), puis :
pnpm import:rna -- --file data/rna/rna_waldec_44.csv --covered-only --limit 2000
```

Options : `--file`, `--sample`, `--limit N`, `--no-geocode`, `--covered-only`
(ne garder que Bretagne/PdL/Normandie), `--status published|pending`, `--dry-run`.

## Reste à faire (prochaines phases)

- **Frontend** `apps/web` : React + Vite + MapLibre GL, branché sur ces endpoints
  (la liste, la carte à pins confetti, le volet de fiche).
- **Auth + modération** des fiches `pending` (référencement).
- **Géocodage en masse** (endpoint CSV batch de la BAN) pour les gros imports.
- **CI** GitHub Actions (lint + build + migrations sur Postgres éphémère).
- **Déploiement** (images Docker de l'API).
