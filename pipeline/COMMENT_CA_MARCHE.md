# 📖 COMMENT ÇA MARCHE — GemensKarte, expliqué simplement


## 1. C'est quoi GemensKarte, en une phrase ?

Une **carte des associations** (18 554 en Vendée) où chaque asso a une fiche avec ses
**liens** (site web, Facebook, Instagram, HelloAsso) et son
**agenda à venir**. Le problème : les données de départ (le fichier officiel des assos, le
« RNA ») sont **pauvres et parfois fausses**. Notre boulot : les **enrichir** et les
**nettoyer** automatiquement.

---

## 2. Le schéma général (les 3 grosses briques)

```
   ┌─────────────────┐     ┌──────────────────────────┐     ┌──────────────────┐
   │  1. LA BASE     │     │  2. LE PIPELINE          │     │  3. L'APPLI      │
   │  (PostgreSQL)   │<───>│  (les scripts Python)    │     │  (site web)      │
   │                 │     │                          │     │                  │
   │  18 554 assos   │     │  Il LIT la base,         │     │  Il LIT la base  │
   │  = la vérité    │     │  cherche des infos sur   │     │  et l'affiche.   │
   │                 │     │  Internet, et ÉCRIT      │     │  Carte + fiches. │
   │                 │     │  les résultats dedans.   │     │                  │
   └─────────────────┘     └──────────────────────────┘     └──────────────────┘
        ▲                          │      ▲                         │
        │                          ▼      │                         ▼
        │                   ┌──────────────────┐            ┌──────────────┐
        └───────────────────│  Internet        │            │  Toi 👀      │
          la base est        │  (DuckDuckGo,    │            │  (navigateur)│
          modifiée par       │   sites web,     │            └──────────────┘
          le pipeline        │   OpenAgenda...) │
                             └──────────────────┘
```

**À retenir :** la BASE est la source de vérité. Le PIPELINE la remplit. L'APPLI l'affiche.
Les trois sont séparés. Si le pipeline s'arrête, l'appli continue d'afficher la dernière version.

---

## 3. Où tourne quoi ? (c'est important)

```
   TON PC WINDOWS (à la maison)              LE SERVEUR "your-server" (sur le réseau local)
   ┌────────────────────────────┐           ┌──────────────────────────────────────┐
   │  • Le PIPELINE (Python)    │           │  • La BASE PostgreSQL (conteneur     │
   │  • Ollama (le cerveau LLM, │  tunnels  │    gk-db) — PAS exposée sur Internet │
   │    sur ta carte graphique) │  SSH      │  • L'API (gk-api) qui sert les données│
   │  • Le SUPERVISOR qui lance │ <───────> │  • Le SITE (gk-web) sur le port 8088 │
   │    tout en boucle          │  (5433 +  │  • Meilisearch (le moteur de recherche)│
   │                            │   5434)   │                                      │
   └────────────────────────────┘           └──────────────────────────────────────┘
```

- Le pipeline tourne **chez toi** parce qu'il a besoin de ton **GPU** (pour le LLM) et de DDG.
- La base n'est **pas accessible depuis Internet**. Pour que ton PC lui parle, on creuse un
  **« tunnel SSH »** : un tuyau chiffré entre ton PC et le serveur.

```bash
# Un tunnel SSH, c'est juste ça : "tout ce qui arrive sur le port 5433 de mon PC,
# envoie-le au port 5432 (Postgres) du conteneur sur le serveur".
ssh -N -L 0.0.0.0:5433:DB_CONTAINER_IP:5432 your-server
#       │   │         │           │      └── le serveur (raccourci SSH)
#       │   │         │           └── le port Postgres DANS le conteneur
#       │   │         └── l'IP du conteneur de la base sur le serveur
#       │   └── le port sur MON PC (j'y connecte mes scripts)
#       └── "-N" = juste le tunnel, n'ouvre pas de session shell
```

> 💡 **Pourquoi DEUX tunnels (5433 et 5434) ?** Un seul tuyau, ça bouchonne quand 11 scripts
> tapent la base en même temps. On en a mis deux : les scripts « légers » passent par 5433,
> les « lourds » par 5434. Résultat : ~2× moins d'embouteillage. Aucune ouverture sur Internet.

---

## 4. La règle d'or du pipeline : PRÉCISION > RAPPEL

C'est LE truc le plus important à comprendre. **(Réponse honnête à « tu trouves 99 % ? » → NON.)**

```
   RAPPEL = "est-ce que je trouve TOUT ce qui existe ?"   ← on n'optimise PAS ça
   PRÉCISION = "ce que j'affiche, est-ce VRAI ?"          ← on optimise ÇA
```

Pourquoi ce choix ? Parce qu'un **mauvais** lien (ex : le Facebook du badminton sur la fiche
d'une asso de musique) est **pire** que pas de lien du tout. Donc le pipeline est **prudent** :

```
   Un lien candidat trouvé sur Internet
              │
              ▼
   Est-ce que le nom de l'asso colle ?  ──NON──►  🗑️ jeté
              │ OUI
              ▼
   Le LLM confirme que c'est bien CETTE asso ?  ──DOUTE──►  🗑️ jeté (ou quarantaine)
              │ OUI, sûr
              ▼
   ✅ AFFICHÉ
```

**Conséquence à assumer :**
- ✅ Ce qui est affiché est **très probablement juste** (peu de faux).
- ❌ On **rate** des liens réels : sites mal référencés, petites assos sans présence web,
  cas ambigus. On ne trouve **pas** 99 % de l'existant. On trouve « l'évident bien indexé ».

> En clair : si une asso a un site connu et bien référencé, on le trouve. Si son site est
> obscur, ou seulement écrit dans un coin de sa page Facebook, on peut le rater. C'est un
> choix assumé : **mieux vaut une fiche vide qu'une fiche fausse.**

---

## 5. Le pipeline, étape par étape (les scripts)

Le pipeline = une chaîne de petits scripts. Chacun fait UNE chose et écrit son résultat dans
la base (dans une colonne `meta` qui est un « tiroir » fourre-tout au format JSON). **Un seul
script a le droit de toucher la colonne `social`** (les liens affichés) : c'est `apply.py`.
Tous les autres écrivent des « preuves » dans `meta`, et `apply` décide à la fin.

```
  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
  │ 1. discover  │──►│ 2. verify    │──►│ 3. apply     │──►│  social{}    │
  │ (cherche)    │   │ (le LLM juge)│   │ (décide)     │   │  = AFFICHÉ   │
  └──────────────┘   └──────────────┘   └──────────────┘   └──────────────┘
    écrit dans         écrit dans          LIT les 2 d'avant   la fiche montre ça
    meta.discovery     meta.verification   et écrit social{}
```

### `discover.py` — SCRAP 1 : "le chercheur" ( ## possible à dupliquer specifique par hello assos, fb, insta, site web ... ? ca me semble galere et pas particulierement pertinent )
```python
# Pour chaque asso, il tape une recherche sur DuckDuckGo :
#   "<nom de l'asso> <ville> association Vendée"
# Il récupère les 10 premiers résultats (titre + url + petit extrait = "snippet").
# Il TRIE les résultats : lesquels ressemblent à un Facebook ? un site ? un annuaire (poubelle) ?
# Il NE décide PAS encore. Il liste juste les "candidats" dans meta.discovery.
```
> ⚠️ DuckDuckGo bloque si on tape trop vite (« rate-limit »). D'où les pauses et le « backoff »
> (attendre de plus en plus longtemps si ça coince).

### `verify_llm.py` — SCRAP 2 : "le juge" (##il peut pas juger sur les snipet pour les fb et tout, ca serait en plus pour quand les protection robots sont hard ?)
```python
# Pour chaque candidat trouvé, il demande à Ollama (le LLM local, sur ton GPU) :
#   "Ce lien appartient-il VRAIMENT à CETTE asso précise ?"
# - Réseaux sociaux (FB/Insta/LinkedIn) : impossibles à lire (ils bloquent les robots),
#   donc le LLM juge sur le TITRE + l'EXTRAIT de la recherche.
# - Sites web : on TÉLÉCHARGE la vraie page, on la nettoie, et le LLM lit le contenu réel.
# Réponse du LLM : keep (garde) / quarantine (doute) / drop (jette) + un score de confiance.
# Écrit tout ça dans meta.verification.
```

### `apply.py` — SCRAP 4 : "le décideur" (le SEUL qui écrit `social`)
```python
# Il relit discover + verify et calcule un SCORE par lien.
#   score >= 0.75            -> social{}        (AFFICHÉ)
#   0.40 <= score < 0.75     -> meta.quarantine (revue humaine)
#   score < 0.40             -> jeté (tracé dans meta.dropped)
# Il RECONSTRUIT social{} à zéro à chaque passage à partir des preuves. Donc si tu modifies
# social "à la main", apply l'écrasera : il faut passer par les preuves (meta.*).
```

### `helloasso.py` — "le spécialiste dons" (## sur hello asso c'est bien protejet des robot ? car il on les liens des sites et reseaux sur les pages presentation des asso)
```python
# Cherche spécifiquement sur helloasso.com. Les liens HelloAsso sont FIABLES (la plateforme
# vérifie déjà l'asso), donc si le nom colle bien, on les garde direct (pas besoin du LLM).
```

### `liveness.py` — SCRAP 5 : "le testeur de liens morts"
```python
# Teste si les SITES WEB et HelloAsso répondent encore (code HTTP).
#  alive (200) / dead (404, domaine disparu) / blocked (403 anti-robot) / error (timeout)
# - On NE teste PAS Facebook/Insta/LinkedIn : ils renvoient 403 à tout le monde -> inutile.
# - "Double-check" : un lien mort est re-testé tout de suite (anti-faux-positif réseau).
# - On re-teste périodiquement (sain tous les 14j, suspect tous les 1j).
# Écrit dans meta.linkHealth. NE retire RIEN tout seul (c'est le rôle du reaper).
```

### `reap_dead.py` — SCRAP 6 : "le faucheur"
```python
# Retire VRAIMENT les liens confirmés morts (par liveness) de la fiche.
#  - 404/410 (page qui n'existe plus) -> retiré tout de suite.
#  - domaine injoignable -> retiré seulement après 12h de panne (au cas où c'est temporaire).
# Tout retrait est tracé dans meta.deadRemoved (réversible).
```

### `score.py` — SCRAP 7 : "le noteur"
```python
# Donne une note /100 + un tier A/B/C/D à chaque fiche, selon :
#  - COUVERTURE  : a-t-elle un site ? un réseau social ? un HelloAsso ?
#  - VÉRIF       : jugée par notre LLM (mieux) ou pas ?
#  - SANTÉ       : ses liens sont-ils vivants ?
#  - FRAÎCHEUR   : vérif récente ? agenda à venir ?
# Cette note pilote aussi les priorités (les fiches faibles repassent en premier).
```

### `events.py` — SCRAP 8 : "l'agenda"
```python
# Récupère les ÉVÉNEMENTS À VENIR via l'API publique OpenAgenda (Opendatasoft).
# ⚠️ On NE scrape PAS infolocale (403 anti-robot total). On utilise une API LÉGALE et gratuite.
# Astuce maligne : il n'y a que ~quelques centaines d'événements à venir en Vendée -> on les
# récupère TOUS en ~3 appels, puis on les rattache à chaque asso PAR DISTANCE (calcul local).
#  - événement dont le nom matche l'asso -> "à elle"
#  - sinon, les plus proches -> "agenda de la commune" (pour que la fiche ne soit jamais vide)
```

### `fb_website.py` + `fb_promote.py` — SCRAP 9 : "le site caché dans le Facebook"
```python
# Idée : une asso qui n'a QUE son Facebook écrit souvent son site dans l'"Intro" de la page FB.
# fb_website.py : DDG indexe cette Intro -> on lit l'extrait DDG de la page FB et on en extrait
#                 un domaine candidat (ex: handiespoir.fr). Écrit meta.fbWebsite (CANDIDAT).
# fb_promote.py : VÉRIFIE ce candidat par LLM (télécharge le site, "c'est bien cette asso ?").
#                 Si oui -> promu en website affiché. Sinon -> abandonné.
# -> Un site trouvé via FB n'est JAMAIS affiché sans cette vérification. Prudence d'abord.
```

---

## 6. Le voyage d'un lien : de "candidat" à "affiché"

```
   DuckDuckGo dit :                meta.discovery
   "facebook.com/MonAsso"   ─────► socialCandidates: [{platform:facebook, url:..., match:slug}]
                                          │
                                          ▼
   Ollama (LLM) juge :             meta.verification
   "oui, confiance 0.9, keep" ────► results: {facebook: {verdict:keep, confidence:0.9}}
                                          │
                                          ▼
   apply.py calcule :              social   (la colonne lue par l'appli)
   score = 0.35*0.9 + 0.65*0.9     {facebook: "facebook.com/MonAsso"}
         = 0.88  >= 0.75      ────► ✅ AFFICHÉ sur la fiche
                                          │
                                          ▼
   liveness teste plus tard :      meta.linkHealth
   (FB non testé)                  reap ne touche pas FB -> reste affiché
```

---

## 7. Comment ça arrive sur le site (temps réel ou pas ?)

```
   Le pipeline écrit dans la base
            │
            ├──► FICHE (détail d'une asso) : l'API lit la base EN DIRECT.
            │      -> tu RAFRAÎCHIS la page = tu vois la dernière version. ✅ quasi temps réel
            │
            ├──► CARTE (les points) : chargée 1 fois quand tu ouvres la carte.
            │      -> il faut RECHARGER pour voir les nouveaux points. ⏳
            │
            └──► RECHERCHE (Meilisearch) : un index séparé, mis à jour SEULEMENT par un "reindex".
                   -> ne contient que nom/ville/catégorie/description (pas les liens).
                   -> à relancer après un gros changement de noms/catégories. ⏳ pas auto
```

---

## 8. L'autonomie : le SUPERVISOR

Un script PowerShell (`supervisor.ps1`) tourne en boucle (tâche planifiée Windows, démarre à
l'ouverture de session, redémarre si crash). Son boulot :

```
   TOUTES LES 2 MINUTES, il vérifie :
   ┌────────────────────────────────────────────────────────────────┐
   │  1. Les 2 tunnels SSH sont-ils up ? sinon -> les relancer       │
   │  2. Ollama tourne-t-il ? sinon -> le relancer                   │
   │  3. Les jobs scrap tournent-ils ? sinon -> les relancer         │
   │       • tunnel 5433 : discover, verify, helloasso, fb->site     │
   │       • tunnel 5434 : liveness, events                          │
   │  4. Tous les ~10 min : apply, reap, purge, score, fb-promote    │
   └────────────────────────────────────────────────────────────────┘
   -> Survit à la fermeture du chat, aux reboots. Tout est "idempotent"
      (le relancer ne casse rien) et "reprenable" (reprend où ça s'est arrêté).
```

---

## 9. État réel actuel (et ce que ça veut dire)

```
   total des assos ............ 18 554
   découvertes (DDG) .......... 10 247  (55%)  ← le scrap a fait plus de la moitié
   vérifiées par notre LLM ....  7 235  (39%)  ← en cours, monte tout seul
   liens appliqués (affichés) .  6 880
   sites web servis ...........  2 724         ← PAS 18 554 : beaucoup d'assos n'ont pas de site
   agenda à venir .............. 13 756  (74%) ← la plupart ont des événements proches
   liens morts retirés ........    231
   note qualité calculée ...... 18 554  (100%)
   candidats site-via-FB ......     45
```

> **Lecture honnête :** "2 724 sites web" ne veut PAS dire qu'on a raté 15 000 sites. Ça veut
> dire que la majorité des petites assos **n'ont pas de site web du tout**. On affiche ce qui
> existe ET qu'on a pu confirmer. Le chiffre montera encore (on n'est qu'à 55% de découverte),
> mais il ne montera jamais à 18 554 : ce plafond n'existe pas dans la vraie vie.

---

## 10. Ce que le système fait BIEN / ce qu'il ne fait PAS

| ✅ Fait bien | ❌ Ne fait pas (assumé) |
|---|---|
| Afficher des liens **justes** (haute précision) | Trouver **tous** les liens existants (rappel partiel) |
| Retirer les liens **morts** et les **faux** legacy | Deviner un site qui n'est référencé **nulle part** |
| Se mettre à jour **tout seul**, en continu | Tout corriger **instantanément** (c'est progressif) |
| Agenda à venir **légal** (OpenAgenda) | Lire infolocale/Facebook directement (403 anti-robot) |
| Noter et prioriser les fiches faibles | Garantir une fiche "complète" pour chaque asso |

---

## 11. Glossaire ultra-court

- **RNA** : le fichier officiel des associations (source de départ, pauvre).
- **DDG** : DuckDuckGo, le moteur de recherche qu'on interroge.
- **LLM / Ollama** : l'« IA » locale (sur ton GPU) qui juge si un lien est le bon.
- **meta** : le tiroir JSON dans la base où chaque script écrit ses preuves.
- **social** : la colonne des liens AFFICHÉS (seul apply.py l'écrit).
- **idempotent** : « relancer ne casse rien ». **rate-limit** : « tu tapes trop vite, attends ».
- **précision** : « ce que je montre est vrai ». **rappel** : « je trouve tout ». On vise la 1ère.
