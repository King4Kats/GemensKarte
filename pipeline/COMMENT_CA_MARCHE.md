# 🛠️ Pipeline GemensKarte — comment ça marche

> Documentation technique du pipeline d'enrichissement, niveau **dev junior → junior++** :
> chaque notion est expliquée *et* documentée précisément (clés JSON, conditions SQL, scoring).
> Ce document décrit la **logique** du pipeline — pas une infrastructure de déploiement précise
> (chacun héberge la base, les workers et le moteur LLM où il veut).

---

## Table des matières

1. [But & principe](#1-but--principe)
2. [Glossaire express](#2-glossaire-express)
3. [Les composants](#3-les-composants)
4. [Le modèle de données (`associations`, `meta`, `social`)](#4-le-modèle-de-données)
5. [Le pipeline, étape par étape](#5-le-pipeline-étape-par-étape)
6. [Cycle de vie d'un lien candidat](#6-cycle-de-vie-dun-lien-candidat)
7. [Le scoring (chiffres exacts)](#7-le-scoring-chiffres-exacts)
8. [Anti-saturation des moteurs](#8-anti-saturation-des-moteurs)
9. [Progression région par région](#9-progression-région-par-région)
10. [Orchestration & reprise](#10-orchestration--reprise)

---

## 1. But & principe

Transformer le **RNA** (Répertoire National des Associations — fichier officiel, pauvre et
parfois faux) en une **carte vivante** : chaque asso reçoit des **liens vérifiés** (site,
Facebook, Instagram, HelloAsso) et un **agenda**.

**Règle d'or : précision > rappel.** Une fiche vide vaut mieux qu'un faux lien. Rien n'est
affiché sans **confirmation par un LLM**. La couverture se fait **région par région**.

Trois composants **faiblement couplés** — si l'un s'arrête, les autres continuent :

```
   ┌────────────────┐  lit/écrit  ┌────────────────────────┐  lit  ┌──────────────┐
   │  LA BASE       │◄───────────►│  LE PIPELINE           │       │  L'APPLI     │
   │  PostgreSQL    │             │  (scripts Python)      │       │  API + SPA   │
   │  = la vérité   │◄─────────────────────────────────────────── │  (lecture)   │
   └────────────────┘    lit                                      └──────────────┘
         ▲                            │  Internet (moteurs, sites, OpenAgenda)
         └── SEUL apply.py écrit ─────┘
             la couche affichée
```

---

## 2. Glossaire express

- **RNA** : fichier officiel des associations françaises ; la source brute.
- **`ddgs`** : lib de méta-recherche (DuckDuckGo, Bing, Brave, Google, Startpage, Yahoo,
  Yandex, Mojeek…). On choisit le moteur par variable d'environnement.
- **LLM / Ollama** : modèle de langage **local** qui juge si un lien appartient bien à l'asso.
- **`meta`** : colonne **JSONB** ; le **journal de bord** où chaque script écrit ses preuves
  et ses horodatages (jamais affiché tel quel).
- **`social`** : colonne **JSONB** des **liens affichés**. **Un seul** script l'écrit : `apply.py`.
- **gating** : la condition `WHERE` qui décide *quelles lignes* un script traite (« pas encore
  traité » ou « plus vieux que N jours ») → rend tout **reprenable**.
- **idempotent** : relancer ne casse rien et ne duplique rien.
- **shard** : tranche de travail. `--shard N/M` = « je traite 1 ligne sur M » → permet de
  lancer M workers concurrents sans doublon.

---

## 3. Les composants

| Composant | Rôle | Remarque |
|---|---|---|
| **Base** PostgreSQL/PostGIS | source de vérité unique (table `associations`) | jamais exposée publiquement ; accédée via tunnel. |
| **Workers de recherche** | exécutent les passes de découverte (`discover*`) | peuvent tourner sur **plusieurs hôtes / IP** pour éviter la saturation des moteurs (voir §8). |
| **Hôte de vérification** (GPU) | exécute le **LLM** (`verify_llm`) + `apply/score/events` | la vérif a besoin du GPU. |
| **API** (NestJS) | sert les données en **lecture directe** depuis la base | pas de cache : ce qu'écrit le pipeline est visible au rechargement. |
| **Front** (SPA Vite) | la carte + les fiches | ré-interroge l'API à chaque visite. |
| **Recherche texte** (Meilisearch) | index séparé pour la barre de recherche | rempli par un **reindex** (les liens `social` n'y sont pas indexés). |

> La recherche n'a besoin que d'Internet + la base → elle peut tourner **en continu**, sur des
> hôtes différents de celui qui fait la vérification LLM.

---

## 4. Le modèle de données

Tout tient dans **une** table : `associations`. Les colonnes qui comptent pour le pipeline :

| Colonne | Type | Rôle |
|---|---|---|
| `id` | `uuid` | clé primaire. ⚠️ pas un entier → pour sharder on hashe (`hashtext(id::text)`). |
| `name`, `city`, `department` | `text` | identité (RNA). `department` pilote la progression. |
| `location` | `geometry` | point PostGIS. **`location IS NOT NULL`** = condition d'éligibilité de presque toutes les passes. |
| `description` | `text` | contexte passé au LLM. |
| `website` | `text` | site « principal » (couche servie, hors `social`). |
| `social` | `jsonb` | **liens affichés** : `{facebook, instagram, website, helloasso, …}`. Écrit **uniquement** par `apply.py`. |
| `status` | `text` | `published` / `pending` … (le site sert `published`). |
| `meta` | `jsonb` | **le journal** : tout le reste (ci-dessous). |

### La colonne `meta` = le bus entre scripts

Chaque étape **lit** une clé `meta`, travaille, **écrit** une autre clé `meta`. La clé écrite par
l'étape N est précisément la **condition de gating** de l'étape N+1. C'est ce « contrat » qui fait
avancer le pipeline sans orchestrateur central.

| Clé `meta` | Écrite par | Lue par (gating) | Contenu |
|---|---|---|---|
| `discovery` | `discover`, `discover_targeted` | `verify_llm`, `apply` | `{socialCandidates[], websiteCandidates[], mairieListings[], mentions[]}` |
| `discoveryAt` | `discover` | `score` | timestamp ISO |
| `fbTargetedAt` / `igTargetedAt` / `webTargetedAt` | `discover_targeted` | `discover_targeted`, `target_dept` | marqueurs « plateforme déjà cherchée » |
| `helloassoCheckedAt` | `helloasso`, `discover_targeted` | idem + `target_dept` | marqueur HelloAsso |
| `verification` | `verify_llm` | `apply`, `score` | `{ts, model, results:{<plat>:{url, verdict, confidence, reason}}}` |
| `verifiedAt` | `verify_llm` | `score` | timestamp ISO |
| `quarantine` | `apply` | `score` | liens 0.40–0.75 (revue humaine) |
| `dropped` | `apply` | (audit) | liens rejetés (trace) |
| `applyAt` | `apply` | `score` | timestamp ISO |
| `legacy` | `apply` (1×) | `apply` (gate) | archive de l'ancien `social` (rollback) |
| `linkHealth` / `linkHealthAt` | `liveness` | `apply`, `reap_dead`, `score` | `{website|helloasso:{status, consecutiveFailures, …}}` |
| `deadRemoved` / `directoryRemoved` | `reap_dead` / `purge_directories` | (audit) | trace des retraits (réversible) |
| `fbWebsite` / `fbWebsiteCheckedAt` / `fbWebsitePromotedAt` | `fb_website`, `fb_promote` | `fb_promote` (gate) | site déduit d'une page FB + verdict |
| `events` / `eventsScrapedAt` | `events` | `score` | agenda à venir (OpenAgenda) |
| `qualityScore` / `qualityComputedAt` | `score` | API / priorisation | `{score, tier, flags[]}` |

> 💡 `meta` n'est jamais montré à l'utilisateur. C'est le dossier d'instruction (toutes les
> preuves + dates) ; `apply.py` est le « juge » qui décide, à partir de ces preuves, ce qui mérite
> d'apparaître dans `social`.

---

## 5. Le pipeline, étape par étape

```
  ┌──────────────────────┐ meta.discovery ┌────────────┐ meta.verification ┌────────┐ social{}
  │ discover(_targeted)  │───────────────►│ verify_llm │──────────────────►│ apply  │────────► AFFICHÉ
  │  + helloasso         │                │  (LLM)     │                   │ (juge) │
  └──────────────────────┘                └────────────┘                   └────────┘
        │                       ┌──────────── maintenance / qualité ───────┴───────────┐
        ▼                       ▼                ▼                ▼                      ▼
   meta.discovery        liveness ─► reap_dead  purge_directories  score              events
   (+ fb_website→fb_promote)  (teste)  (retire morts) (annuaires)  (note + tier)      (agenda)
```

Pour chaque script : rôle · args clés · **lit** (gating) · **écrit** · env. Défaut DB :
`localhost:5433`. `--dry-run` désactive les écritures.

### `discover.py` — découverte générale
- **Rôle** : 1 recherche `"<nom> <ville> association"` par asso, classe le top ~10 en candidats
  typés (réseaux / site / annuaire) via `lib_match.classify()`.
- **Args** : `--limit --offset --dept --redo --dry-run --sleep` (def. 1.5).
- **Lit** : `location IS NOT NULL` ET (sauf `--redo`) `meta->'discovery' IS NULL` [+ `--dept`].
- **Écrit** : `meta.discovery`, `meta.discoveryAt`. **Ne touche pas `social`.**
- **Env** : `DATABASE_URL`, `GK_DDGS_BACKEND/PROXY/TIMEOUT/COOLDOWN` (§8).

### `discover_targeted.py` — découverte ciblée par plateforme
- **Rôle** : recherche **dédiée** là où la générale rate (`site:facebook.com "<nom>" <ville>`…).
- **Args** : `--platform {facebook|instagram|helloasso|website}` (requis) `--limit --dept --redo --sleep`.
- **Lit** : `location IS NOT NULL` ET lien plateforme pas déjà dans `social` ET (réseaux) pas déjà
  candidat ET (sauf `--redo`) marqueur plateforme absent.
- **Écrit** : fusionne dans `meta.discovery` (cap 3 nouveaux candidats sociaux, 5 sites), pose le
  marqueur (`fbTargetedAt`…), et **efface `meta.verification.model`** si nouveaux candidats →
  `verify_llm` reprend la fiche tout seul.

### `helloasso.py` — HelloAsso (auto-confiance)
- **Rôle** : trouve la page HelloAsso ; matching **strict** (slug vs tokens du nom, rejette les
  slugs « étrangers », ignore les tokens géo). Plateforme déjà vérifiée → fiable.
- **Lit** : `location IS NOT NULL` ET `NOT social ? 'helloasso'` ET (sauf `--redo`) `helloassoCheckedAt` absent.
- **Écrit** : `social.helloasso` **directement** (confiance 1.0, sans LLM) + `meta.helloassoFound` + `meta.helloassoCheckedAt`.

### `lib_match.py` — utilitaires de matching (pas d'I/O DB)
- `classify(asso, results)` → candidats typés avec un `match_type` (`slug` > `top1` > `slug_sub` >
  `slug_city` > `top2` > `top3` > `title` > `fallback`) qui sert de **prior** au scoring (§7).

### `verify_llm.py` — le juge LLM
- **Rôle** : pour chaque candidat, « ce lien est-il bien CETTE asso ? ».
  - **Réseaux (FB/IG)** : page non scrapable → jugement sur **titre + snippet + `match_type`**.
  - **Sites** : on **télécharge** la page (Trafilatura/readability) → jugement sur le **texte réel**.
  - **HelloAsso** : auto-trust (confiance 1.0, `verdict=keep`, sans appel LLM).
- **Args** : `--limit --dept --redo --max-sites` (def. 2) `--model` `--shard N/M`.
- **Lit** : `meta->'discovery' IS NOT NULL` ET (sauf `--redo`) `meta->'verification'->>'model' IS NULL`
  [+ shard : `(hashtext(id::text) %% M + M) %% M = N`].
- **Écrit** : `meta.verification = {ts, model, results:{…}}`, `meta.verifiedAt`.
- **Env** : `DATABASE_URL`, `OLLAMA_HOST`, `VERIFY_MODEL`.

> ⚠️ **Piège `%%`** : psycopg interprète `%` comme placeholder dès qu'on passe des paramètres ; le
> modulo du shard doit donc s'écrire `%%`. Et comme `id` est un **uuid**, on hashe (`hashtext`).

### `apply.py` — le décideur (SEUL à écrire `social`)
- **Rôle** : fusionne **prior** (`discovery.match_type`) + **verdict LLM** (`verification`) en un
  **score** par lien, puis route : appliqué / quarantaine / jeté. **Reconstruit `social` à zéro**
  à chaque passe (déterministe, rejouable).
- **Args** : `--limit --dept --dry-run --apply-th` (def. 0.75) `--quar-th` (def. 0.40).
- **Lit** : `meta->'verification'->>'model' IS NOT NULL`.
- **Écrit** : `social{}`, `meta.quarantine`, `meta.dropped`, `meta.applyAt`, `meta.legacy` (1×).
- **Garde-fou liveness** : un lien `status='dead'` (≥2 échecs) est retiré de `social`.

### `liveness.py` + `reap_dead.py` — santé des liens
- `liveness` : HTTP parallèle (def. 32 workers) sur **sites + HelloAsso** (jamais les réseaux :
  403 généralisé). Statuts `alive`/`dead`/`blocked`/`error`. Gating temporel : 14 j (sain) / 1 j
  (suspect). Écrit `meta.linkHealth` + `linkHealthAt`.
- `reap_dead` : retire un lien `dead` avec `consecutiveFailures ≥ 2` ; 404/410 immédiat, sinon
  après `min-age-hours` (def. 12). Trace `meta.deadRemoved` (réversible).

### `purge_directories.py` — nettoyage annuaires
- Retire les domaines d'annuaires (mappy, cerfapp) glissés dans la couche servie. Trace `meta.directoryRemoved`.

### `score.py` — note qualité (voir §7)
- Agrège en **0–100 + tier A/B/C/D + flags**. Gating : ne recalcule que si une source est plus
  récente que `qualityComputedAt`. Écrit `meta.qualityScore`.

### `events.py` — agenda
- API **OpenAgenda / Opendatasoft** (publique). Événements à venir rattachés par **proximité + nom**
  (rayon def. 12 km, cap 6/asso). Gating `eventsScrapedAt` (def. 3 j). Écrit `meta.events`.

### `fb_website.py` + `fb_promote.py` — site caché dans un Facebook
- `fb_website` : pour les assos FB-only, extrait un **domaine candidat** du snippet. Écrit `meta.fbWebsite`.
- `fb_promote` : **vérifie le candidat par LLM** (télécharge le site), promeut dans `website` si
  `verdict=keep` ET `confidence ≥ 0.7`.

---

## 6. Cycle de vie d'un lien candidat

```
 [1] DÉCOUVERTE   discover / discover_targeted / helloasso
     écrit  meta.discovery = { socialCandidates:[{platform,url,slug,match_type,rank,title,snippet}],
                               websiteCandidates:[{url,host,score,title,snippet}], … }
            │  gate suivant : meta.discovery EXISTE && meta.verification.model ABSENT
            ▼
 [2] VÉRIFICATION (LLM)   verify_llm  (shardable 0/2, 1/2, …)
     écrit  meta.verification = { ts, model, results:{ facebook:{url,verdict,confidence,reason}, … } }
            │  gate suivant : meta.verification.model EXISTE
            ▼
 [3] DÉCISION   apply   score = f(prior(match_type), confidence_llm)        (formules §7)
       verdict "keep"                  → social[plat] = url   (ignore le score)
       verdict "quarantine" & conf≥0.85 → social[plat] = url
       score ≥ 0.75                    → social[plat] = url
       0.40 ≤ score < 0.75             → meta.quarantine[plat]
       score < 0.40 ou verdict drop    → meta.dropped[]
       lien liveness=dead              → retiré de social
            │
            ▼
 [4] QUALITÉ + MAINTENANCE   liveness → reap_dead → (purge) ; score (/100, A–D) ; events (agenda)
```

**Réinjection** : si `discover_targeted` ajoute un candidat, il **efface `verification.model`** →
la fiche redevient éligible à `verify_llm` puis `apply`. Aucun appel manuel : le gating suffit.

---

## 7. Le scoring (chiffres exacts)

### a) Score d'un lien (`apply.py`)

`prior` selon le `match_type` :
```
slug 0.90 · top1 0.70 · slug_sub 0.60 · slug_city 0.55 · top2 0.50 · top3 0.35 · title 0.30 · fallback 0.10
```
Combinaison prior × confiance LLM :
```
réseau, match "slug" :  score = 0.65*prior + 0.35*conf
réseau, autre match  :  score = 0.35*prior + 0.65*conf
site web             :  score = 0.25*site_prior(disc_score) + 0.75*conf
```
Seuils : **≥ 0.75** appliqué · **0.40–0.75** quarantaine · **< 0.40** jeté.
Exceptions : `verdict=keep` → appliqué ; `verdict=quarantine & conf≥0.85` → appliqué ; HelloAsso →
appliqué ; lien `dead` → retiré.

### b) Note qualité d'une fiche (`score.py`, /100)
```
COUVERTURE   35  =  site 15  +  réseaux 12  +  helloasso 8
VÉRIFICATION 25  =  verif_model 15 (×0.45 si legacy)  +  verif_conf 10 (moyenne des conf "keep")
SANTÉ        20  =  health_clean 14 (aucun mort)  +  health_allalive 6
FRAÎCHEUR    20  =  fresh_verif 7 (décroît 90j→365j) + fresh_health 5 (21j→90j)
                    + fresh_press 2 + has_press 2 + fresh_events 4
```
Tiers : **A ≥ 80 · B 60–79 · C 40–59 · D < 40**. Le tier sert à **prioriser** les fiches faibles
en interne (non affiché au public).

---

## 8. Anti-saturation des moteurs

**Problème** : N boucles de découverte sur le **même moteur** depuis la **même IP** → le moteur
bloque (timeouts, 0 résultat).

**Solution** : chaque passe = un **couple (moteur × IP) unique**.

```
   AVANT (cassé)                          APRÈS (réparti)
   N boucles ─┐                           passe A : moteur1 @ IP1
   N boucles ─┼─► 1 moteur @ 1 IP         passe B : moteur2 @ IP1
   N boucles ─┘      💥 saturé            passe C : moteur3 @ IP2
                                          passe D : moteur4 @ IP2  …
```

Piloté par variables d'env (lues dans `discover.py` / `discover_targeted.py`) :

| Variable | Rôle |
|---|---|
| `GK_DDGS_BACKEND` | **liste** de moteurs (`google,bing,yahoo`). Au moindre échec, le retry **bascule** au suivant. |
| `GK_DDGS_PROXY` | proxy SOCKS optionnel (sortie par une autre IP). |
| `GK_DDGS_TIMEOUT` | délai d'attente (plus long derrière un proxy). |
| `GK_DDGS_COOLDOWN` | un moteur « rate-limited » est mis au repos (def. 180 s). |

> ⚠️ Le scraping HTML des moteurs **fluctue** (selon l'IP et l'heure). D'où les **listes avec
> repli** : un primaire distinct par passe + des moteurs fiables en filet. `search_with_retry`
> bascule au moteur suivant sur `DDGSException`.

---

## 9. Progression région par région

On traite **un département à la fois**, dans l'ordre d'une liste cible. `target_dept.py` renvoie le
**premier département encore en travail** :

```sql
-- "pas fini" = il reste ≥ 1 asso géolocalisée à qui manque la découverte OU une passe ciblée :
SELECT EXISTS(
  SELECT 1 FROM associations
  WHERE department = %s AND location IS NOT NULL
    AND ( (meta->'discovery') IS NULL
       OR (meta->>'fbTargetedAt')       IS NULL
       OR (meta->>'igTargetedAt')       IS NULL
       OR (meta->>'webTargetedAt')      IS NULL
       OR (meta->>'helloassoCheckedAt') IS NULL )
  LIMIT 1);
```

- **Done** = plus aucune asso ne matche → on passe au département suivant.
- Timeouts internes → ne peut jamais geler la boucle appelante.
- Suivi : `progress.py --dept <code>` (barre par plateforme), `stats.py` (vue globale).

---

## 10. Orchestration & reprise

- **Découpage du travail** : `verify_llm.py --shard N/M` permet **plusieurs workers de vérification
  concurrents** sur la même file, sans doublon (partition par `hashtext(id)`).
- **Reprise** : chaque passe **commit par ligne** et utilise un **gating** (timestamp / marqueur) →
  relancer reprend exactement où ça s'est arrêté. Tout est **idempotent**.
- **Tunnels** : la base n'étant jamais exposée, les scripts s'y connectent via un tunnel SSH local
  (voir [`RUN.md`](RUN.md) pour la commande générique).

> Pour la procédure d'exécution pas à pas, voir [`RUN.md`](RUN.md).
