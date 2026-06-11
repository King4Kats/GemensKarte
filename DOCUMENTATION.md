# GemensKarte — Documentation technique complète

> Carte web interactive des associations françaises (à partir du RNA, le Répertoire
> National des Associations), enrichie automatiquement (liens sociaux, site, agenda…).
> Ce document explique **tout le projet** — le site web ET les scripts d'enrichissement —
> avec des explications pensées pour un·e **développeur·se junior** (le jargon est expliqué
> au fil de l'eau).

---

## Table des matières

1. [Vue d'ensemble](#1-vue-densemble)
2. [Glossaire junior (les mots qui font peur)](#2-glossaire-junior)
3. [Architecture globale](#3-architecture-globale)
4. [Le dépôt (monorepo) en un coup d'œil](#4-le-dépôt-monorepo)
5. [La base de données](#5-la-base-de-données)
6. [Le backend — l'API (apps/api)](#6-le-backend--lapi)
7. [Le frontend — le site (apps/web)](#7-le-frontend--le-site)
8. [Le moteur de recherche (Meilisearch)](#8-le-moteur-de-recherche-meilisearch)
9. [Le pipeline d'enrichissement (scripts Python)](#9-le-pipeline-denrichissement)
10. [Le superviseur (orchestrateur du pipeline)](#10-le-superviseur)
11. [Import des données RNA](#11-import-des-données-rna)
12. [Déploiement & infrastructure](#12-déploiement--infrastructure)
13. [Le flux de données, de bout en bout](#13-le-flux-de-données-de-bout-en-bout)
14. [Territoires & états de scrap](#14-territoires--états-de-scrap)
15. [Sécurité](#15-sécurité)

---

## 1. Vue d'ensemble

**Le problème** : les données officielles sur les associations (le RNA, publié par l'État
sur data.gouv.fr) sont **pauvres** : on a le nom, l'objet (description), l'adresse… mais
**pas** les liens utiles (site web, Facebook, Instagram, page de dons HelloAsso).

**Ce que fait GemensKarte** :
1. **Importe** le RNA dans une base de données et **géolocalise** chaque association
   (transforme l'adresse en coordonnées GPS pour la poser sur une carte).
2. **Enrichit** automatiquement chaque fiche : des scripts cherchent les liens sur le web,
   une **IA** vérifie que chaque lien appartient bien à la bonne association, et seuls les
   liens **confirmés** sont publiés.
3. **Affiche** le tout sur une **carte web** interactive, avec recherche par mots-clés,
   filtres par catégorie, etc.

**Règle d'or du projet** : *« mieux vaut une fiche vide qu'une fiche fausse »* — on
privilégie toujours la **justesse** (précision) à l'exhaustivité.

**En ligne** : https://gemenskarte.fr

---

## 2. Glossaire junior

Quelques mots qu'on croise partout dans le projet :

| Mot | Ce que ça veut dire (en simple) |
|---|---|
| **Frontend** | Le site qu'on voit dans le navigateur (HTML/CSS/JS). Ici : React. |
| **Backend / API** | Le programme côté serveur qui répond aux demandes du frontend (« donne-moi les assos », « envoie ce formulaire »). Ici : NestJS. |
| **API** | « Interface de programmation » : une liste d'adresses (URL) que le frontend appelle pour obtenir des données. Ex : `GET /api/associations/geojson`. |
| **Base de données (DB)** | Là où sont stockées les données de façon durable. Ici : PostgreSQL. |
| **PostGIS** | Une extension de PostgreSQL qui sait gérer des **points GPS** et faire des calculs géographiques (distances, « qui est dans cette zone »…). |
| **jsonb** | Un type de colonne PostgreSQL qui stocke du **JSON** (des objets `{clé: valeur}`) directement en base. Pratique pour des données souples. |
| **Monorepo** | Un seul dépôt git qui contient **plusieurs projets** (le site, l'API, le code partagé). |
| **pnpm** | Un gestionnaire de paquets (comme npm/yarn) : il installe les librairies et gère le monorepo (les « workspaces »). |
| **Docker / conteneur** | Une « boîte » qui embarque un programme + tout ce qu'il lui faut pour tourner, à l'identique sur n'importe quelle machine. |
| **Docker Compose** | Un fichier qui décrit **plusieurs conteneurs** à lancer ensemble (la base, l'API, le site…). |
| **Meilisearch** | Un moteur de recherche ultra-rapide et tolérant aux fautes de frappe (pour l'autocomplétion / le filtre par mots-clés). |
| **LLM / IA** | « Large Language Model », un modèle d'IA qui comprend du texte. Ici on utilise **Ollama** (qui fait tourner un LLM en local) pour vérifier les liens. |
| **DDG** | DuckDuckGo, le moteur de recherche utilisé par les scripts pour trouver les liens. |
| **RNA** | Répertoire National des Associations (la source officielle des données). |
| **BAN** | Base Adresse Nationale (api-adresse.data.gouv.fr) : transforme une adresse en GPS (**géocodage**). |
| **Upsert** | « update or insert » : insère une ligne, ou la met à jour si elle existe déjà. |
| **Idempotent** | Une opération qu'on peut relancer 10 fois sans rien casser ni dupliquer. |

---

## 3. Architecture globale

Le projet a **4 briques** qui tournent en conteneurs Docker sur un serveur, **plus** un
pipeline de scripts qui tourne sur un **PC local** (pas sur le serveur).

```
                          INTERNET
                             │
                    ┌────────▼─────────┐
                    │  Cloudflare      │  gemenskarte.fr (HTTPS)
                    │  Tunnel          │
                    └────────┬─────────┘
                             │
   ┌─────────────────────────▼──────────────────────────┐
   │  SERVEUR (noob-serveur) — Docker Compose            │
   │                                                     │
   │   ┌─────────┐   /api/*   ┌──────────┐               │
   │   │ gk-web  │──────────► │  gk-api  │               │
   │   │ (nginx) │            │ (NestJS) │               │
   │   │  React  │            └────┬─────┘               │
   │   └─────────┘                 │                     │
   │                     ┌─────────┼─────────┐           │
   │                ┌────▼────┐         ┌─────▼──────┐    │
   │                │  gk-db  │         │ meilisearch│    │
   │                │ Postgres│         │ (recherche)│    │
   │                │ +PostGIS│         └────────────┘    │
   │                └────▲────┘                           │
   └─────────────────────┼───────────────────────────────┘
                         │ tunnels SSH (depuis le PC local)
                         │
   ┌─────────────────────┴───────────────────────────────┐
   │  PC LOCAL — le PIPELINE (scripts Python)             │
   │  superviseur.ps1 + Ollama (IA locale) + DuckDuckGo   │
   │  discover → verify (IA) → apply → score …            │
   └─────────────────────────────────────────────────────┘
```

**Pourquoi le pipeline tourne en local et pas sur le serveur ?**
- Il a besoin d'**Ollama** (l'IA), qui tourne mieux avec un **GPU** (carte graphique).
- Il interroge **DuckDuckGo** en masse, ce qui passe mal depuis un serveur (rate-limit).
- Il se connecte à la base distante via des **tunnels SSH** (des « tuyaux » chiffrés qui
  rendent la base distante accessible comme si elle était locale, sur `localhost:5433`).

---

## 4. Le dépôt (monorepo)

```
GemensKarte/
├── apps/
│   ├── web/                 # LE SITE (React + Vite)
│   │   └── src/
│   │       ├── App.tsx          # racine : choisit l'écran à afficher
│   │       ├── main.tsx         # point d'entrée React
│   │       ├── screens/         # les "pages" (Landing, MapView)
│   │       ├── components/      # briques réutilisables (Logo, SearchBar, AssoSheet…)
│   │       ├── lib/             # utilitaires (api.ts = client API, categories…)
│   │       ├── data/            # données front (départements, tracés SVG)
│   │       └── styles.css       # variables CSS + styles globaux
│   └── api/                 # LE BACKEND (NestJS)
│       └── src/
│           ├── main.ts          # démarrage du serveur
│           ├── app.module.ts    # assemble tous les modules
│           ├── associations/    # liste, carte (geojson), fiche, création
│           ├── search/          # Meilisearch (suggest, filtre mots-clés)
│           ├── stats/           # chiffres (transparence) + avancement
│           ├── contact/         # formulaires → email
│           ├── geo/             # géocodage (BAN) + régions
│           ├── import/rna/      # importeur du RNA
│           ├── db/              # connexion DB (Drizzle), schéma, migrations
│           ├── config/          # validation des variables d'environnement
│           └── common/          # garde-fous (anti-spam, validation Zod)
├── packages/
│   └── shared/              # CODE PARTAGÉ web↔api (schémas Zod, types TypeScript)
├── pipeline/                # LES SCRIPTS Python d'enrichissement
├── deploy/                  # Dockerfiles + config nginx
├── data/rna/               # fichiers RNA (.csv.gz) récupérés de data.gouv
├── scripts/                # scripts utilitaires (smoke test…)
├── .github/workflows/      # CI (tests) + fetch-rna (téléchargement RNA mensuel)
└── docker-compose.prod.yml # description des conteneurs de prod
```

**Le code partagé (`packages/shared`)** mérite un mot : c'est là que vivent les **schémas
Zod**. Zod est une librairie qui décrit la *forme* attendue des données (« un email doit
être un email valide », « limit est un entier entre 1 et 50 »). Comme web et api importent
les mêmes schémas, ils sont **toujours d'accord** sur la forme des données échangées.

---

## 5. La base de données

PostgreSQL (+ PostGIS pour la géo). La table centrale est **`associations`**.

### Colonnes principales

| Colonne | Type | Rôle |
|---|---|---|
| `id` | uuid | identifiant unique interne |
| `rna_id` | text | identifiant officiel RNA (ex. `W851000003`) — sert à l'**upsert** |
| `name` | text | nom de l'association |
| `slug` | text | nom « URL-friendly » |
| `category_id` | text | catégorie (sport, culture, social…) |
| `description` | text | **l'objet RNA** (ce que fait l'asso) |
| `website`, `phone`, `email`, `address`, `postal_code`, `city` | text | infos RNA |
| `department`, `region` | text | déduits du code postal |
| `tags` | text[] | mots-clés |
| `status` | text | `published` (visible) ou autre |
| `source` | text | `rna` ou ajout manuel |
| `location` | geometry (PostGIS) | le **point GPS** (longitude, latitude) |
| `social` | jsonb | les liens **enrichis** : `{facebook, instagram, website, helloasso, linkedin}` |
| `meta` | jsonb | tout le « cerveau » de l'enrichissement (voir ci-dessous) |
| `created_at`, `updated_at` | timestamp | dates |

### La colonne `meta` (jsonb) — le cerveau

C'est un objet JSON qui accumule tout ce que le pipeline sait d'une fiche :

- `meta.discovery` : les **candidats** trouvés sur le web
  - `socialCandidates: [{platform, url, match_type}]`
  - `websiteCandidates: [{url, score}]`
- `meta.verification` : le **jugement de l'IA** par plateforme
  - `results.facebook = {url, confidence (0-1), verdict ("keep"|"quarantine"|"drop"), reason}`
  - `model` : le modèle IA utilisé (sert à savoir si c'est à re-juger)
- `meta.quarantine` / `meta.dropped` : liens douteux mis de côté / écartés
- `meta.linkHealth` : état de santé des liens (vivant/mort, testé par liveness)
- `meta.events` : agenda à venir
- `meta.qualityScore` : note interne `{score 0-100, tier A/B/C/D, flags}`
- des **marqueurs d'idempotence** : `fbTargetedAt`, `igTargetedAt`, `webTargetedAt`,
  `helloassoCheckedAt`, `applyAt`, `discoveryAt`… (« cette passe a déjà traité cette fiche »)

> 💡 **Pourquoi `social` ET `meta` séparés ?** `social` = la **vérité affichée** (les liens
> publics). `meta` = le **brouillon de travail** du pipeline (candidats, jugements…). Un seul
> script (`apply.py`) a le droit d'écrire `social`, à partir de `meta.verification`.

---

## 6. Le backend — l'API

Framework : **NestJS** (un framework Node.js structuré en « modules », « contrôleurs »,
« services »).
- Un **contrôleur** = reçoit les requêtes HTTP (les URL appelées par le front).
- Un **service** = fait le vrai travail (parler à la base, calculer…).
- Le contrôleur ne calcule rien : il **délègue** au service.

Toutes les routes commencent par `/api`.

### Les modules

| Module | Routes / rôle |
|---|---|
| **associations** | `GET /associations/geojson` (les points de la carte), `GET /associations` (liste paginée), `GET /associations/:id` (une fiche), `POST /associations` (référencer une asso). |
| **search** | `GET /search/suggest?q=…` (autocomplétion), `GET /search/match?q=…` (tous les ids qui matchent un mot — sert au **filtre carte par mots-clés**). |
| **stats** | `GET /stats` (chiffres de transparence, **national**), `GET /stats/progress` (avancement des passes par réseau, **scopé Vendée**). |
| **contact** | `POST /contact/recenser`, `POST /contact/deferencer` → envoie un **email** (nodemailer + SMTP). |
| **geo** | géocodage via BAN (`geocoder.service`) + table département→région (`regions.ts`). |
| **import/rna** | l'importeur du RNA (lancé en ligne de commande, pas une route HTTP). |
| **db** | connexion à PostgreSQL via **Drizzle** (un ORM léger : il permet d'écrire des requêtes SQL en TypeScript), le **schéma** des tables, les **migrations**. |
| **config** | `env.ts` valide les **variables d'environnement** au démarrage avec Zod (si `MEILI_HOST` manque, l'app refuse de démarrer — c'est volontaire). |
| **common** | garde-fous : `RateLimitGuard` (anti-spam par IP), `ZodValidationPipe` (rejette les requêtes mal formées). |

### Exemple concret : afficher les points sur la carte

1. Le front appelle `GET /api/associations/geojson?department=85`.
2. `AssociationsController.geojson()` reçoit la requête, la valide, et appelle le service.
3. `AssociationsService.geojson()` fait une requête SQL PostGIS :
   ```sql
   SELECT id, name, category_id, city, ST_X(location) AS lng, ST_Y(location) AS lat
   FROM associations
   WHERE department = '85' AND location IS NOT NULL
     -- on exclut les points (0,0) : échecs de géocodage tombés "au large de l'Afrique"
     AND NOT (ST_X(location) BETWEEN -1 AND 1 AND ST_Y(location) BETWEEN -1 AND 1)
   ```
4. Il renvoie un **GeoJSON** (un format standard de données géo) que la carte sait afficher.

---

## 7. Le frontend — le site

Stack : **React** (librairie d'interface) + **Vite** (outil de build ultra-rapide) +
**TypeScript** (du JavaScript typé) + **Leaflet** (la librairie de carte).

Particularité du projet : les styles sont écrits **en ligne** (des objets `style={{…}}`
directement dans le JSX), avec des **variables CSS** définies dans `styles.css` (couleurs,
rayons, ombres). Pas de Tailwind ni de CSS Modules.

### Les écrans (`screens/`)

- **`Landing.tsx`** — la page d'accueil nationale. Elle contient :
  - l'en-tête (logo + nav, qui devient un **menu burger** sur mobile),
  - le **héros** avec la **carte de France** (`DepartmentMap`) pour choisir un territoire,
  - des sections : « le projet », « qualité des données » (avec le **suivi en direct** de
    l'enrichissement), « transparence des données » (chiffres), « ressources », « dons », pied de page.
- **`MapView.tsx`** — l'écran carte d'un territoire :
  - en-tête (logo, recherche, boutons),
  - barre de **filtres par catégorie** + les **chips de mots-clés** (filtre carte),
  - la **carte Leaflet** avec les points regroupés en *clusters* (paquets),
  - la **fiche** (`AssoSheet`) qui s'ouvre à droite au clic sur un point.

### Les composants clés (`components/`)

| Composant | Rôle |
|---|---|
| `Logo.tsx` | le logo (image `public/logo.png`), cliquable. |
| `SearchBar.tsx` | la barre de recherche « contrôlée » : autocomplétion (assos) + suggestions de **ville** (zoom au clic). |
| `AssoSheet.tsx` | la fiche détaillée d'une asso (liens, catégorie, agenda…). |
| `DepartmentMap.tsx` | la carte SVG de France ; colore chaque territoire selon son **état de scrap**. |
| `Icon.tsx` | un jeu d'icônes SVG. |
| `CatBadge.tsx` | la pastille colorée d'une catégorie. |
| `ConfettiField.tsx` | l'animation de confettis décorative. |
| `ContactModal.tsx` | la fenêtre des formulaires « référencer / déréférencer ». |

### Le client API (`lib/api.ts`)

C'est l'**unique** endroit qui parle au backend. Chaque fonction fait un `fetch` vers une
route et renvoie les données typées. Exemples :
```ts
api.geojson({ department: "85" })   // points de la carte
api.get(id)                         // une fiche complète (rechargée à CHAQUE ouverture
                                    //  -> toujours fraîche, jamais en cache)
api.suggest(q, 6, dept)             // autocomplétion
api.matchIds(q, dept)               // ids qui matchent un mot (filtre carte)
api.fetchStats() / api.fetchProgress()
api.recenser(data) / api.deferencer(data)
```

### Le filtre carte par mots-clés (exemple de fonctionnalité)

Quand on tape un mot dans la barre et qu'on valide :
1. Le front appelle `api.matchIds("music", dept)` → l'API demande à **Meilisearch** tous les
   ids d'assos dont le **nom OU le descriptif** contient « music » (avec synonymes :
   music↔musique…), et renvoie la liste d'ids.
2. Le mot devient une **chip** (étiquette avec une croix pour la retirer).
3. La carte **masque** tous les points qui ne sont pas dans cette liste d'ids.
4. Plusieurs mots = **croisement** (intersection) : on ne garde que les assos qui matchent
   *tous* les mots.

---

## 8. Le moteur de recherche (Meilisearch)

Meilisearch est un index **séparé** de la base, optimisé pour la recherche.
- On y pousse une version **allégée** de chaque asso (id, nom, ville, catégorie, tags,
  **description**) via `reindex.ts` (`pnpm search:reindex`).
- **Champs cherchables** : `["name", "city", "categoryLabel", "tags", "description"]` — donc
  la recherche trouve un mot aussi bien dans le **titre** que dans le **descriptif RNA**.
- **Synonymes** : `music→musique`, `foot→football`, `velo→cyclisme/vtt`…
- **Tolérance aux fautes** activée.
- `pagination.maxTotalHits = 20000` (le défaut 1000 tronquait les mots très courants).

> ⚠️ Meilisearch n'est **pas** mis à jour tout seul : après un gros import ou un changement
> de réglages, il faut **réindexer** (`pnpm search:reindex`).

---

## 9. Le pipeline d'enrichissement

Des scripts **Python** (dans `pipeline/`) qui transforment des fiches RNA pauvres en fiches
riches. Ils tournent sur le PC local, orchestrés par le superviseur (section 10).

**Le principe général** : `découvrir → vérifier → appliquer`, plus des passes d'entretien.

### Les scripts, un par un

| Script | Ce qu'il fait |
|---|---|
| **`discover.py`** | Pour chaque asso, **1 recherche DuckDuckGo générale** (`"<nom> <ville> association Vendée"`), et range les liens trouvés (site, réseaux) dans `meta.discovery`. |
| **`discover_targeted.py`** | Recherche **ciblée par plateforme** : `--platform facebook` → `site:facebook.com "<nom>" <ville>`. Trouve les pages que la recherche générale rate. Ajoute le candidat dans `meta.discovery` puis efface `meta.verification.model` pour que la vérif reprenne la fiche. Paramétrable : `--platform facebook|instagram|helloasso|website`, `--dept 85`. |
| **`verify_llm.py`** | L'**IA juge** chaque candidat. Ollama (modèle local) reçoit le titre/extrait de la page et répond : `keep` (c'est bien cette asso), `quarantine` (plausible mais doute), `drop` (non), + un niveau de **confiance** 0-1. Écrit dans `meta.verification`. |
| **`apply.py`** | **Le seul** script qui écrit la colonne `social`. Il reconstruit `social` à partir de `meta.verification` : applique les `keep`, les liens au score ≥ seuil, et — règle spéciale réseaux sociaux — les **quarantaines à confiance ≥ 0.85** (le LLM ne peut pas *lire* une page FB bloquée, mais s'il est sûr du nom, on garde). |
| **`lib_match.py`** | La **logique de correspondance** (commune à plusieurs scripts) : à quel point une URL correspond au nom de l'asso (`match_type` : `slug`, `slug_city`, `title`, `fallback`…), et la liste des **annuaires** à exclure (mappy, cerfapp…). |
| **`helloasso.py`** | Correspondance **stricte** HelloAsso (utilisée en interne par `discover_targeted.py --platform helloasso`). |
| **`liveness.py`** | Teste en HTTP si les liens sont **vivants** (ou morts/cassés) → `meta.linkHealth`. |
| **`reap_dead.py`** | Retire de `social` les liens **confirmés morts** (≥ 2 échecs). |
| **`purge_directories.py`** | Retire les liens d'**annuaires** déguisés en site (mappy, cerfapp…). |
| **`events.py` / `clean_events.py`** | Récupère l'**agenda à venir** (API OpenAgenda) et le nettoie. |
| **`fb_website.py` / `fb_promote.py`** | Pour une asso qui n'a QUE Facebook, tente d'extraire son **site web** depuis l'« Intro » de la page FB (visible dans l'extrait DDG), puis le valide avant de l'appliquer. |
| **`score.py`** | Calcule une **note qualité** par fiche (`meta.qualityScore`) : couverture (liens), vérification, santé des liens, fraîcheur, agenda → `score 0-100` + tier A/B/C/D. Sert au tri/priorisation **interne** (le badge n'est plus affiché au public). |
| **`progress.py`** | Affiche en console l'**avancement** des passes ciblées par plateforme (scannées / restantes / validées / %). La même logique est exposée en API par `GET /stats/progress`. |
| **`stats.py`, `rate.py`** | Petits utilitaires. |

### Notions clés du matching

- **`match_type`** (force de la correspondance URL↔nom) avec une probabilité a priori :
  `slug` 0.90, `top1` 0.70, `slug_sub` 0.60, `slug_city` 0.55, `title` ~0.20…
- **Seuils dans `apply.py`** : on applique si `score ≥ 0.75` (`apply_th`), on met en
  quarantaine si `≥ 0.40` (`quar_th`), sinon on jette.
- **Idempotence** : chaque passe pose un **marqueur** (`fbTargetedAt`…) et saute les fiches
  déjà traitées → on peut tout relancer sans refaire le travail ni taper DuckDuckGo pour rien.

---

## 10. Le superviseur

`pipeline/supervisor.ps1` (PowerShell) est le **chef d'orchestre** lancé par une tâche
planifiée Windows (au démarrage). Il :
- ouvre et **maintient 2 tunnels SSH** vers la base distante (un « léger » sur le port 5433
  pour les jobs DuckDuckGo/IA, un « lourd » sur 5434 pour les jobs base) ;
- s'assure qu'**Ollama** (l'IA) tourne ;
- lance chaque script en **boucle** (un job qui tourne en continu, avec des pauses) ;
- **auto-répare** : si un tunnel ou un job meurt, il le relance ;
- un **bloc périodique** (toutes les ~10 min) fait `apply` / `reap` / `purge` / `score` / `fb_promote`.

Les passes DuckDuckGo (`discover`, `helloasso`, `facebook/instagram/website` ciblées) sont
**scopées sur la Vendée** (`--dept 85`) : l'enrichissement reste concentré sur le territoire
en cours, même si la base contient déjà d'autres territoires (Occitanie) **non encore enrichis**.

> Les cadences sont **volontairement basses** (petits lots, longues pauses) parce que toutes
> les passes **partagent DuckDuckGo** : le but est d'éviter le *rate-limit* (blocage anti-robot).

---

## 11. Import des données RNA

Deux étapes :

1. **Télécharger** (`.github/workflows/fetch-rna.yml`, une GitHub Action) : télécharge le
   fichier RNA national (waldec) depuis data.gouv.fr, le **filtre** au périmètre couvert
   (un `keep = {…codes départements…}`), compresse en `.csv.gz` et le **commit** dans `data/rna/`.
   Tourne automatiquement le 5 de chaque mois (le RNA est mensuel).

2. **Importer** (`pnpm import:rna -- --file <csv.gz> --covered-only`) :
   - lit le CSV ligne par ligne,
   - **classe** chaque asso dans une catégorie (`classifier.ts`),
   - **géocode** les adresses **en masse** via la BAN (endpoint CSV `/search/csv/`),
   - **upsert** par `rna_id` (idempotent) : `ON CONFLICT (rna_id) DO UPDATE`.

> 🔒 **Important** : l'upsert ne touche **que** les champs RNA (nom, description, adresse,
> location…). Il **ne touche PAS** `social` ni `meta` → on peut ré-importer sans **perdre
> l'enrichissement** déjà fait par le pipeline.

Après un import : penser à **réindexer Meilisearch** (`pnpm search:reindex`).

---

## 12. Déploiement & infrastructure

### Conteneurs (docker-compose.prod.yml)

| Service | Image | Rôle |
|---|---|---|
| `db` (gk-db) | postgis/postgis | la base PostgreSQL + PostGIS |
| `meilisearch` | getmeili/meilisearch | le moteur de recherche |
| `api` (gk-api) | build `deploy/Dockerfile.api` | le backend NestJS |
| `web` (gk-web) | build `deploy/Dockerfile.web` | nginx qui sert le site React **et** fait proxy `/api → gk-api` |

Seul **gk-web** est exposé sur le LAN (`8088:80`). La base et Meili restent en réseau interne.

### Mise en ligne (Cloudflare Tunnel)

Un conteneur **cloudflared** crée un tunnel sortant vers Cloudflare, qui sert
`https://gemenskarte.fr` → gk-web. Aucun port ouvert sur internet côté serveur.
Cloudflare **ne met pas en cache** les réponses `/api` (`cf-cache-status: DYNAMIC`) → les
fiches sont toujours fraîches.

### Secrets

Tout est dans un fichier **`.env`** sur le serveur (chmod 600, **gitignoré**) :
`POSTGRES_PASSWORD`, `DATABASE_URL`, `MEILI_MASTER_KEY`, `ADMIN_TOKEN`, `SMTP_USER/PASS`,
`CORS_ORIGIN`… Le `docker-compose` lit ces variables via `${VAR}`. **Aucun secret dans git.**

### Déployer une modif (résumé)

```bash
# 1) synchroniser le code source vers le serveur
rsync -a apps/ noob-serveur:/home/flavien/gemenskarte/apps/
# 2) reconstruire + relancer le(s) conteneur(s) concerné(s)
ssh noob-serveur 'cd ~/gemenskarte && docker compose -f docker-compose.prod.yml build web api && \
                  docker compose -f docker-compose.prod.yml up -d web api'
```

### CI (intégration continue)

`.github/workflows/ci.yml` : à chaque push, installe les deps (pnpm), lance le build/les
vérifs côté backend Node. `fetch-rna.yml` : télécharge le RNA (mensuel ou sur déclenchement).

---

## 13. Le flux de données, de bout en bout

```
 data.gouv.fr (RNA)                          DuckDuckGo + Ollama (IA, local)
        │                                              │
        ▼ fetch-rna (GitHub Action)                    │
   data/rna/*.csv.gz                                   │
        │                                              │
        ▼ import:rna (géocodage BAN)                   │
 ┌──────────────────────────┐                          │
 │  TABLE associations      │◄─── discover / discover_targeted (écrit meta.discovery)
 │   name, description,     │◄─── verify_llm           (écrit meta.verification)
 │   location, social{},    │◄─── apply                (écrit social{} depuis verification)
 │   meta{}                 │◄─── liveness/reap/purge/score/events …
 └───────────┬──────────────┘
             │  (lecture)
        ┌────▼─────┐         ┌─────────────┐
        │  gk-api  │────────►│ Meilisearch │  (reindex pousse une copie cherchable)
        │ (NestJS) │         └─────────────┘
        └────┬─────┘
             │ /api/*
        ┌────▼─────┐
        │  gk-web  │  → le navigateur de l'utilisateur (gemenskarte.fr)
        └──────────┘
```

1. **fetch-rna** télécharge le RNA → `import:rna` remplit la base (fiches géolocalisées,
   `social` vide).
2. Le **pipeline** enrichit : `discover` trouve des candidats → `verify_llm` les juge →
   `apply` pose les liens validés dans `social`. Les passes d'entretien gardent tout propre.
3. L'**API** lit la base ; **Meilisearch** garde une copie cherchable.
4. Le **site** affiche : carte, fiches, recherche, stats.

---

## 14. Territoires & états de scrap

Le projet couvre des **départements**, chacun avec un **état** (affiché en couleur sur la
carte de France de l'accueil — voir `apps/web/src/data/departements.ts`) :

| Couleur | État | Sens | Territoires actuels |
|---|---|---|---|
| 🩷 rose | `en_cours` | scrap en cours d'enrichissement | **Vendée** (85) |
| 🔵 bleu | `non_scrape` | importé (RNA) mais **pas encore enrichi** : infos RNA seules | **Occitanie sans l'Hérault** (12 dépts : 09, 11, 12, 30, 31, 32, 46, 48, 65, 66, 81, 82) |
| 🟢 vert | `fait` | scrap terminé | (aucun pour l'instant) |

- **Côté backend**, `apps/api/src/geo/regions.ts` mappe département→région et définit le
  **périmètre couvert** (`isCovered`). Le même périmètre se retrouve dans le `keep` de
  `fetch-rna.yml`.
- **Côté frontend**, `data/departements.ts` définit la liste + l'**état** de chaque
  département ; `DepartmentMap.tsx` colore la carte en conséquence.
- La **transparence** (`/stats`) est **nationale** (toute la base) ; le **suivi**
  (`/stats/progress`) est **scopé au territoire en cours** (Vendée). Quand on bascule de
  territoire, on change deux constantes dans `stats.service.ts`
  (`TERRITOIRE_EN_COURS` / `TERRITOIRE_DEPT` / `PROCHAIN_TERRITOIRE`).

---

## 15. Sécurité

- **Aucun secret dans git** : tout dans `.env` (serveur, chmod 600, gitignoré).
- **Validation systématique** des entrées via Zod (`packages/shared` + `ZodValidationPipe`).
- **Anti-spam** : `RateLimitGuard` (par IP) sur les formulaires de contact et la création.
- **CORS** restreint à `gemenskarte.fr`.
- **Pas de port ouvert** sur internet (tunnel Cloudflare sortant uniquement).
- Les formulaires envoient un **email** (SMTP), ils n'écrivent pas en base directement.
- Le pipeline écrit via des **tunnels SSH** chiffrés, jamais d'exposition réseau.

---

*Document maintenu à la main — pense à le mettre à jour quand l'archi évolue
(nouveau territoire, nouveau script, nouveau module API…).*
