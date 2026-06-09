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
apps/web             Frontend React + Vite + Leaflet (DA "Confetti")
  src/components     Icon, Logo, CatBadge, AssoCard, SearchBar, ConfettiField, AssoSheet
  src/screens        Landing (recherche prédictive) + MapView (split carte/liste)
  src/lib            Client API + catégories
```

## Frontend (apps/web)

Recréation fidèle de la maquette **Claude Design** ("Peps, Épurée & Confetti",
Plus Jakarta Sans, palette confetti) en React + Vite, branchée sur l'API :
- **Landing** : héro + baseline soulignée, recherche prédictive (autocomplétion
  Meilisearch via `/search/suggest`), chips de catégories, confettis flottants,
  stats réelles (nombre d'assos depuis l'API).
- **Split-screen** : liste de cards "confetti" + carte **Leaflet + CARTO**, pins
  ronds colorés, popup au survol, filtres multi-catégories, sync liste↔carte,
  fly-to à la sélection (données `/associations?located=true`).
- **Fiche** : volet latéral qui glisse (bandeau coloré, stats, "ce que l'asso
  recherche", description, contacts, réseaux, CTA). S'adapte aux champs présents.

```bash
pnpm dev:web   # http://localhost:5173 (proxy /api → :3000)
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

Source : **Répertoire National des Associations** (Ministère de l'Intérieur),
publié mensuellement sur data.gouv.fr. data.gouv fournit un **fichier national
agrégé** (Waldec et Import) en **CSV** et **Parquet** — l'importeur lit le CSV.
- Dataset : <https://www.data.gouv.fr/fr/datasets/repertoire-national-des-associations/>
- Agrégé : <https://www.data.gouv.fr/fr/datasets/rna-agrege-a-lechelle-nationale/>

Colonnes waldec utilisées : `id` (n° RNA), `titre`/`titre_court`, `objet`,
`adrs_numvoie`/`adrs_typevoie`/`adrs_libvoie`, `adrs_codepostal`,
`adrs_libcommune`, `siteweb`, `nature`, `date_disso`. Séparateur `;`.

`apps/api/src/import/rna` :
1. **Parse** le CSV waldec en flux, par lots (mémoire bornée), encodage
   configurable (`utf8` pour l'agrégé, `latin1` pour les anciens dumps).
2. **Filtre** les associations dissoutes (`date_disso`) et, en option, hors
   périmètre (`--covered-only`).
3. **Classe** chaque asso dans une catégorie confetti par mots-clés
   (`classifier.ts`) — le RNA n'a pas de catégorie exploitable directement.
4. **Géocode** l'adresse via la **Base Adresse Nationale**, en masse par lot
   (endpoint CSV `/search/csv/`, adapté au volume ~1,5 M d'assos) ou unitaire.
5. **Upsert** par `rna_id` (idempotent ; ne perd pas une position déjà géocodée).

### Récupération automatique (GitHub Actions)

L'environnement de dev a un réseau en liste blanche (data.gouv inaccessible).
Le workflow [`fetch-rna.yml`](.github/workflows/fetch-rna.yml) télécharge le
fichier national (~1,2 Go) sur les **runners GitHub** (réseau ouvert), le
**filtre sur le périmètre couvert** (~358 000 associations), normalise le
séparateur, compresse et committe `data/rna/rna_covered.csv.gz` (~54 Mo ; mensuel
+ à la demande). L'importeur lit ce `.gz` directement :

```bash
pnpm import:rna -- --file data/rna/rna_covered.csv.gz && pnpm search:reindex
```

### Import manuel

```bash
# 1. Télécharger le fichier agrégé waldec (CSV) depuis le dataset ci-dessus
#    dans data/rna/ (réseau ouvert requis), puis :
pnpm import:rna -- --file data/rna/rna_waldec.csv --covered-only

# Ancien dump départemental Latin-1 :
pnpm import:rna -- --file data/rna/rna_waldec_44.csv --encoding latin1

# Test hors-ligne sans réseau :
pnpm import:rna -- --sample --no-geocode
```

Options : `--file`, `--sample`, `--limit N`, `--batch-size N`,
`--encoding utf8|latin1`, `--no-geocode` / `--geocode-single` (défaut : masse),
`--covered-only` (Bretagne/PdL/Normandie), `--status published|pending`,
`--dry-run`.

## Reste à faire (prochaines phases)

- **Auth + modération** des fiches `pending` (référencement).
- **Écran "Ajouter mon asso"** (formulaire de référencement public).
- **CI** GitHub Actions (lint + build + migrations sur Postgres éphémère).
- **Déploiement** (images Docker de l'API).
