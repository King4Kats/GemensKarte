# Passe B — Spike enrichissement (site web + réseaux sociaux)

Objectif : valider, sur un échantillon, si on peut trouver automatiquement le site
officiel et les réseaux sociaux des associations de Vendée, avant d'industrialiser.

## Ce qui a été testé

### Piste 1 — ScrapeGraphAI `SearchGraph` + Ollama local (mistral:7b) — ABANDONNÉE
- Setup OK (venv, scrapegraphai, playwright chromium, Ollama + nomic-embed-text).
- **Verdict : non viable.** Sur CPU (pas de GPU), chaque appel LLM ≈ **70 s**, et un
  SearchGraph enchaîne génération de requête + scraping de 3 pages (Playwright) + RAG
  multi-chunks + fusion → **7 à 12 min par asso**, avec des blocages sur le fetch des pages.
  Impossible de produire ne serait-ce qu'un échantillon. Extrapolé à 18 k assos = des semaines.

### Piste 2 — Recherche web (DuckDuckGo via `ddgs`) + heuristiques — RETENUE
- `tools/enrichment/enrich_lite.py`. Pas de Playwright, pas de LLM.
- **~2 s / asso**, 0 erreur. Extrapolé : ~10 h pour 18 k assos. Gratuit, sans infra.
- Heuristiques :
  - réseaux sociaux = host ∈ {facebook, instagram, helloasso, linkedin, youtube…} **+**
    correspondance d'un token du nom (titre ou URL) → évite les vidéos/pages random ;
  - site officiel = candidat dont le **nom est dans le domaine** (sinon = simple mention) ;
  - sites de mairie / comcom détectés à part → **liste d'assos = cible de la Passe A**.

## Résultats

| Échantillon (60 assos, aléatoire représentatif) | Taux |
|---|---|
| Réseaux sociaux trouvés | **33 %** (20/60) |
| Site / page dédiée trouvé | **27 %** (16/60) |
| Lien liste mairie/comcom remonté | **50 %** (30/60) |

Échantillon « pire cas » (50 micro-assos alphabétiques 0…/2…) : 20 % socials, 54 % mairie.

### Précision (revue manuelle)
- **HelloAsso ≈ 100 %** : slug = nom exact (`/associations/les-pipelettes-en-baskets`). Signal fiable.
- **Facebook ≈ 80 %** : `facebook.com/saintjazzsurvie/` bon ; parfois un *post*/mention au lieu de la page (corrigeable en préférant les URL racines `/<page>/` ou `/people/`).
- **Site officiel ≈ 55-60 %** : bons (`saint-jazz-sur-vie.com`, `vendee-volley.fr`, `wing-tsun-montaigu.jimdosite.com`, `acutis.fr`) mais aussi faux positifs (collisions de domaine, annuaires, fédé générique). **À ne pas auto-appliquer sans vérification.**

## Recommandation

1. **Industrialiser la Passe B en mode heuristique** (cette piste 2), pas ScrapeGraphAI.
2. **Auto-appliquer** uniquement le haut-de-précision : HelloAsso + Facebook avec match de nom fort.
3. Champ « site officiel » → **file de relecture** (ou 1 court appel LLM de vérification
   *uniquement* sur les ~25 % ayant un candidat — pas un SearchGraph complet).
4. Les **50 % de liens mairie/comcom** sont le pont direct vers la **Passe A** (scraper ces
   pages « liste des associations » puis croiser avec le RNA par nom normalisé + commune).

## Fichiers
- `enrich_lite.py` — script retenu (search + heuristiques).
- `enrich_search.py` — piste ScrapeGraphAI/Ollama (gardée pour mémoire, trop lente).
- `results_random_60.json` — sortie détaillée (candidats + scores) sur l'échantillon représentatif.
- `results_lite_50.json` — sortie sur l'échantillon « pire cas ».
- `sample_random.json` / `sample.json` — échantillons d'entrée.
