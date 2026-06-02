# 🎉 GemensKarte

> **La carte du territoire de tes assos.**
> Le « Google Maps » joyeux, accessible et open-source pour répertorier,
> découvrir et connecter les associations locales — Bretagne, Pays de la
> Loire et Normandie.

GemensKarte rompt radicalement avec l'austérité des annuaires administratifs.
Son identité visuelle **« Peps, Épurée & Confetti »** transforme chaque
association en une touche de couleur festive qui célèbre la vie locale, sur une
base ultra-épurée (blanc cassé, beaucoup de respiration, typographies nettes).

## 📦 Contenu de ce dépôt

| Élément | Description |
|---------|-------------|
| `index.html` | **Prototype cliquable auto-suffisant** (HTML/CSS/JS pur, aucune dépendance réseau). Couvre les 3 écrans : Landing + recherche, vue split-screen Liste/Carte, et la fiche association en volet latéral. |
| `DESIGN.md` | Direction artistique complète : palette, typographie, layout, micro-interactions, accessibilité. |
| `components/AssoCard.jsx` | Version **React + Tailwind** des composants clés (card « confetti », boutons, tags, pin). |
| `apps/api`, `packages/shared` | **Backend** NestJS + PostGIS + Meilisearch + import RNA. Voir [`TECH.md`](TECH.md). |

## 🛠️ Backend (API)

Stack : **NestJS · PostgreSQL/PostGIS · Meilisearch · import open data RNA**, en
TypeScript de bout en bout. Détails et endpoints dans [`TECH.md`](TECH.md).

```bash
cp .env.example .env
pnpm install
bash scripts/dev-setup.sh   # infra + schéma + données + index
pnpm dev:api                # http://localhost:3000/api
bash scripts/smoke.sh       # vérifie tous les endpoints
```

La [CI](.github/workflows/ci.yml) rejoue tout ce parcours (PostGIS + Meilisearch
en services) à chaque commit. Les données RNA réelles sont récupérées par le
workflow [`fetch-rna.yml`](.github/workflows/fetch-rna.yml).

## 🚀 Voir le prototype

Ouvrez simplement `index.html` dans un navigateur :

```bash
# option 1 — directement
xdg-open index.html        # Linux
open index.html            # macOS

# option 2 — petit serveur local
python3 -m http.server 8000   # puis http://localhost:8000
```

Parcours à tester : cliquez sur la barre de recherche ou une suggestion →
vous basculez sur la **vue carte**. Survolez une card (le pin jumeau rebondit),
filtrez par catégorie, puis cliquez une asso pour ouvrir la **fiche en volet
latéral**.

## 🎨 Palette « Confetti »

| Catégorie | Couleur | |
|-----------|---------|---|
| Écologie | `#19C37D` vert peps | 🌱 |
| Culture | `#EC2D8A` magenta | 🎭 |
| Sport | `#FFB020` jaune soleil | ⚽ |
| Social | `#3B6BFF` bleu électrique | 🤝 |
| Jeunesse | `#8B5CF6` violet | 🎓 |
| Santé | `#FF6B57` corail | ❤️ |

Fond off-white `#FDFCF9`, encre `#1A1A2E`. **La couleur appartient au contenu
(les assos), jamais au châssis.**

## ♿ Accessibilité

La couleur ne porte jamais seule l'information : chaque catégorie est doublée
d'un émoji + libellé (daltonisme). Contrastes AA, focus visibles, animations
décoratives désactivées via `prefers-reduced-motion`.

---

Projet associatif & open-source. Contributions bienvenues 💚
