# 🎉 GemensKarte

> **La carte du territoire de tes assos.**
> Un « Google Maps » joyeux, accessible et open-source pour répertorier, découvrir et
> connecter les associations locales — Bretagne · Pays de la Loire · Normandie.
> **18 554 associations** géolocalisées, enrichies et nettoyées **automatiquement**.

GemensKarte rompt avec l'austérité des annuaires administratifs : identité visuelle
**« Peps, Épurée & Confetti »**, chaque association devient une touche de couleur sur une
carte vivante. Mais derrière la carte, le vrai travail est la **qualité des données** :
partir du fichier officiel (RNA, pauvre et parfois faux) et le transformer en fiches fiables,
fraîches et utiles.

---

## 🧱 Architecture — 3 briques séparées

```
   ┌──────────────┐      ┌─────────────────────────┐      ┌──────────────┐
   │  LA BASE     │◄────►│  LE PIPELINE            │      │  L'APPLI     │
   │  PostgreSQL  │      │  (scripts Python, local)│      │  API + Web   │
   │  + PostGIS   │      │  cherche sur Internet,  │      │  lit la base │
   │  = la vérité │      │  juge (LLM), nettoie    │      │  et l'affiche│
   └──────────────┘      └─────────────────────────┘      └──────────────┘
```

- **La base** est la source de vérité (table `associations`, colonne `social` = liens
  affichés, colonne `meta` = preuves/métadonnées au format JSON).
- **Le pipeline** la remplit et la nettoie en continu, en autonomie.
- **L'appli** affiche la dernière version. Les trois sont découplés.

> 📖 Explication complète et imagée (mode débutant, avec schémas) :
> **[`pipeline/COMMENT_CA_MARCHE.md`](pipeline/COMMENT_CA_MARCHE.md)**.

---

## 📂 Structure du dépôt

| Dossier | Rôle |
|---|---|
| `apps/api` | **API NestJS** (Drizzle/PostgreSQL, PostGIS, Meilisearch, import RNA). Sert les fiches, la recherche, l'agenda, le score qualité. |
| `apps/web` | **Front React + Vite** : carte Leaflet, recherche, fiche association (volet latéral), badge qualité, agenda à venir. |
| `packages/shared` | Types & schémas Zod partagés API ↔ Web (catégories, `Association`, requêtes). |
| `pipeline/` | **Pipeline d'enrichissement** (Python) : découverte, vérification LLM, nettoyage, score, agenda, liens morts. Voir [`pipeline/RUN.md`](pipeline/RUN.md). |
| `deploy/` | Dockerfiles de prod (api, web, enrich). |
| `tools/enrichment` | Scripts d'enrichissement « legacy » utilisés par certains services Docker. |
| `docker-compose.prod.yml` | Déploiement complet (db, meilisearch, api, web) sur le serveur. |
| `DESIGN.md` · `TECH.md` | Direction artistique · détails techniques back/API. |

---

## 🚀 Lancer l'app en local

```bash
cp .env.example .env
pnpm install
bash scripts/dev-setup.sh   # infra Docker + schéma + données + index Meilisearch
pnpm dev:api                # API  -> http://localhost:3000/api
pnpm dev:web                # Web  -> http://localhost:5173
bash scripts/smoke.sh       # vérifie tous les endpoints
```

### Déploiement (serveur)

```bash
# build + (re)démarrage des conteneurs api + web
docker compose -f docker-compose.prod.yml build api web
docker compose -f docker-compose.prod.yml up -d api web
# réindexer la recherche après un gros changement de noms/catégories
docker compose -f docker-compose.prod.yml exec api pnpm --filter @gemenskarte/api search:reindex
```

Le web est servi sur le port **8088**.

---

## 🤖 Le pipeline d'enrichissement (`pipeline/`)

Une chaîne de petits scripts Python, chacun fait **une** chose et écrit ses preuves dans
`meta`. **Un seul** script écrit les liens affichés (`apply.py`). Tout est **idempotent**
(relancer ne casse rien) et **reprenable**.

| Étape | Script | Rôle (en une phrase) |
|---|---|---|
| 1 | `discover.py` | Cherche sur DuckDuckGo les liens candidats (site, FB, Insta…). |
| 2 | `verify_llm.py` | Le LLM local (Ollama) juge si chaque lien est **vraiment** à cette asso. |
| 3 | `press_filter.py` | Date & nettoie les articles de presse (périmés, bruit). |
| 4 | `apply.py` | **Décide** : applique / quarantaine / jette. Seul à écrire `social`. |
| — | `helloasso.py` | Trouve les pages HelloAsso (fiables, slug vérifié). |
| 5 | `liveness.py` | Teste si les sites/HelloAsso répondent encore (liens morts). |
| 6 | `reap_dead.py` | Retire les liens confirmés morts (avec garde-fous anti-faux-positif). |
| 7 | `score.py` | Note chaque fiche /100 + tier A/B/C/D (qualité & fraîcheur). |
| 8 | `events.py` | Agenda à venir via l'API publique **OpenAgenda** (rattaché par proximité). |
| 9 | `fb_website.py` + `fb_promote.py` | Extrait un site depuis l'« Intro » d'un Facebook, puis le vérifie par LLM. |
| ⚙️ | `supervisor.ps1` | Orchestre tout en boucle, en autonomie (2 tunnels SSH, auto-réparation). |

Prérequis : Python + venv (`pipeline/requirements.txt`), Ollama (GPU) avec un modèle, et 2
tunnels SSH vers la base. Détails dans [`pipeline/RUN.md`](pipeline/RUN.md).

### 🎯 Philosophie des données : **précision avant exhaustivité**

Le pipeline est **prudent** : un mauvais lien est pire que pas de lien. Il n'affiche un lien
que s'il est **confirmé**. Conséquence assumée :

- ✅ Ce qui est affiché est **très probablement juste**.
- ❌ On ne trouve **pas** 100 % des liens existants (les sites obscurs ou les assos sans
  présence web sont ratés). **Mieux vaut une fiche vide qu'une fiche fausse.**

---

## 🎨 Identité « Confetti »

| Catégorie | Couleur | | Catégorie | Couleur | |
|---|---|---|---|---|---|
| Écologie | `#19C37D` | 🌱 | Social | `#3B6BFF` | 🤝 |
| Culture | `#EC2D8A` | 🎭 | Éducation | `#8B5CF6` | 🎓 |
| Sport | `#FFB020` | ⚽ | Solidarité | `#FF6B57` | ❤️ |

Fond off-white `#FDFCF9`, encre `#1A1A2E`. **La couleur appartient au contenu (les assos),
jamais au châssis.** Accessibilité : couleur jamais seule (émoji + libellé), contrastes AA,
`prefers-reduced-motion` respecté.

---

Projet associatif & open-source, fait avec ❤️ en Vendée. Données : RNA © Ministère de
l'Intérieur · Agenda : OpenAgenda · Cartographie : OpenStreetMap. Contributions bienvenues 💚
