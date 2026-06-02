# GemensKarte — Direction Artistique & UX

> **GemensKarte** — *La carte du territoire de tes assos.*
> Le « Google Maps » joyeux des associations locales (Bretagne, Pays de la Loire, Normandie).

---

## 1. Le concept visuel : « Peps, Épurée & Confetti »

L'idée directrice tient en une image : **chaque association est un confetti**. Une
petite touche de couleur vive qui, multipliée sur la carte et dans les listes,
donne l'impression d'un territoire qui pétille de vie. Mais le confetti ne
fonctionne que sur fond neutre : c'est le **contraste entre une base
ultra-épurée (blanc cassé, beaucoup de respiration, typo nette) et des
accents saturés** qui crée l'effet « wahou » sans tomber dans le bruit visuel.

Règle d'or : **la couleur appartient au contenu (les assos), jamais au châssis.**
L'interface (barres, fonds, bordures) reste blanche/grise. On rompt ainsi
radicalement avec l'austérité des annuaires administratifs.

---

## 2. Système de couleurs

### Base (le « papier »)
| Rôle | Hex | Usage |
|------|-----|-------|
| Fond principal | `#FDFCF9` | Off-white chaud, jamais blanc pur |
| Surface / cartes | `#FFFFFF` | Cards, panneaux, barres |
| Encre (texte) | `#1A1A2E` | Titres, corps de texte |
| Encre secondaire | `#6B7280` | Descriptions, méta |
| Bordure douce | `#ECEAE3` | Séparateurs 1px discrets |

### Couleurs de catégories (les « confettis »)
Saturées, joyeuses, immédiatement mémorisables. Chaque catégorie = 1 teinte
de marque + 1 fond pastel (le pastel = teinte à ~12 % d'opacité, pour les tags).

| Catégorie | Couleur vive | Pastel (tag) | Émoji repère |
|-----------|--------------|--------------|--------------|
| Écologie / Environnement | `#19C37D` vert peps | `#E4F8EF` | 🌱 |
| Culture / Arts | `#EC2D8A` magenta | `#FCE3F0` | 🎭 |
| Sport / Loisirs | `#FFB020` jaune soleil | `#FFF3DA` | ⚽ |
| Social / Solidarité | `#3B6BFF` bleu électrique | `#E5ECFF` | 🤝 |
| Jeunesse / Éducation | `#8B5CF6` violet | `#EFE9FE` | 🎓 |
| Santé / Bien-être | `#FF6B57` corail | `#FFE9E5` | ❤️ |

L'arc-en-ciel complet n'apparaît **jamais en aplat plein écran** : il se révèle
uniquement à travers les pins, les tags et les micro-accents. Le « confetti »
de la landing est le seul moment où l'on s'autorise un festival de couleurs.

---

## 3. Typographie

- **Titres / baseline :** `Poppins` (ou `Sora` / `Outfit`) — géométrique,
  ronde, chaleureuse. Poids 600–700. Légère réduction du letter-spacing
  sur les gros titres (`-0.02em`).
- **Texte courant & UI :** `Inter` — neutre, ultra-lisible, excellente en
  petit corps (descriptions de cards, méta).
- **Échelle (desktop) :** Display 56px / H1 40px / H2 28px / Titre card 17px /
  Body 15px / Méta 13px / Tag 12px (uppercase, `letter-spacing .04em`).
- Fallback système complet pour garantir le rendu hors-ligne :
  `Inter, "Segoe UI", system-ui, sans-serif`.

---

## 4. Les écrans

### 4.1 Landing + Recherche — l'effet « wahou »
- **Hero plein écran**, fond off-white, généreusement aéré.
- **Baseline traitée graphiquement** : « La carte du territoire de **tes assos** »
  où les deux derniers mots sont soulignés d'un trait de **surligneur dessiné
  à la main** (SVG ondulé) dans une couleur de catégorie.
- **Pluie de confettis** en arrière-plan : petits ronds/losanges colorés
  flottants (CSS animation lente, faible opacité) — la métaphore est posée dès
  la première seconde, sans gêner la lecture.
- **Barre de recherche centrale, surdimensionnée**, en deux champs fusionnés :
  `Que cherchez-vous ?` + `Où ?`, et un gros bouton rond « Explorer ».
  Ombre douce et colorée (pas de gris terne : une ombre légèrement teintée).
- **Puces de suggestions** (« Théâtre à Nantes », « Rando à Rennes »…) sous la
  barre, en pastilles pastel — donne envie de cliquer.
- **Transition** : au scroll ou au clic, la carte « monte » depuis le bas avec
  les confettis qui se transforment en pins (continuité de la métaphore).

### 4.2 Vue principale — Split-screen Liste + Carte
- **Layout :** 2 colonnes. Liste à gauche (~40 %, scrollable), carte à droite
  (~60 %, sticky). Header global fin et fixe.
- **Barre de filtres** par catégorie : pastilles colorées toggle (couleur pleine
  = actif, contour = inactif). Filtrer = faire scintiller/estomper les
  confettis correspondants sur la carte.
- **Carte d'asso = un confetti :**
  - Tag catégorie coloré (pastel + texte teinté + émoji) en haut.
  - Nom en **gras** (Poppins 600).
  - Mini-description 2 lignes max (truncate).
  - Ligne méta : 📍 ville · distance.
  - Micro-bouton d'action discret (« Voir » / cœur favori).
  - **Hover :** la card se soulève (`translateY(-4px)`), ombre qui s'intensifie
    et **se teinte de la couleur de la catégorie**, et une fine **barre
    verticale colorée** apparaît à gauche. Le pin correspondant sur la carte
    rebondit en miroir (lien liste ↔ carte).
- **Carte interactive :** style OSM **désaturé/clair custom** (routes blanches,
  eau bleu très pâle, pas de POI parasites) pour que **seuls les confettis
  ressortent**.
  - **Pins = confettis ronds** : disque de couleur catégorie, liseré blanc
    épais, légère ombre portée. Pas de « goutte » Google Maps classique.
  - **Survol d'un pin :** il grossit légèrement + micro-popup épurée (carte
    blanche arrondie : nom + tag + 1 ligne), flèche fine.
  - **Clusters :** quand plusieurs assos se superposent, un confetti plus gros
    avec un compteur, dégradé doux des couleurs présentes.

### 4.3 Fiche association — volet latéral
- **Slide-in depuis la droite** (drawer), largeur ~420 px, le reste de la page
  s'assombrit légèrement (overlay 20 %). Animation `cubic-bezier` douce.
- **En-tête coloré** : bandeau de la couleur de la catégorie (aplat ou dégradé
  subtil) avec le tag + un grand titre. Bouton fermer rond en haut à droite.
- **Corps épuré, en sections aérées :**
  - Description.
  - Coordonnées (adresse, téléphone, email) en lignes à icônes.
  - **Réseaux sociaux** : rangée de boutons ronds.
  - Tags secondaires (« Bénévolat », « Famille », « Gratuit »…).
- **Footer collant** : bouton d'action principal **plein, couleur catégorie,
  large** : « Contacter / Rejoindre » + bouton secondaire « Itinéraire ».

---

## 5. Boutons & composants

- **Bouton primaire :** plein, couleur d'accent, coins très arrondis (`14px`),
  ombre teintée, `hover` = légère montée + ombre plus colorée, `active` =
  enfoncement.
- **Bouton secondaire :** fond blanc, bordure douce, texte encre.
- **Pastille / tag :** fond pastel, texte couleur vive, `border-radius` plein
  (pill), 12px uppercase.
- **Rayons :** cards `20px`, boutons `14px`, tags `999px`. Rondeur =
  convivialité associative.
- **Ombres :** jamais noires. Toujours une ombre **colorée et très diffuse**
  (`0 12px 30px -8px rgba(couleur, .35)`), c'est la signature « peps ».

## 6. Micro-interactions (résumé)
| Élément | Interaction |
|---------|-------------|
| Card asso (hover) | lift + ombre teintée + barre latérale + pin jumeau qui rebondit |
| Pin (hover) | scale 1.15 + micro-popup |
| Bouton primaire | lift + ombre colorée |
| Filtres | toggle couleur, assos non concernées en fade |
| Confettis landing | flottement lent, parallax léger à la souris |
| Drawer | slide-in 320 ms `cubic-bezier(.22,1,.36,1)` + overlay fade |

## 7. Accessibilité
- Contraste AA garanti : la couleur de catégorie ne porte **jamais** seule
  l'information → toujours doublée d'un **émoji + libellé** (daltonisme).
- Cibles tactiles ≥ 44 px, focus visibles (anneau coloré).
- Confettis décoratifs `aria-hidden`, animations désactivées si
  `prefers-reduced-motion`.

---

Le fichier `index.html` est un **prototype cliquable auto-suffisant** (aucune
dépendance réseau) qui met en œuvre ces trois écrans et le système de cards/boutons.
