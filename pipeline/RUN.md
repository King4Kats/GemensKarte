# GemensKarte — Pipeline de vérification stricte des liens

Refonte complète : découverte DDG → vérif LLM locale (Ollama) → filtre presse → apply/route.
Un seul script écrit dans `social` (apply). Tout le reste écrit des preuves dans `meta.*`.
Chaque passe est **idempotente** (gating timestamp) et **reprenable** (commit par ligne).

## Prérequis (machine Windows locale, GPU AMD RX 7800 XT)

1. **Ollama** lancé avec le modèle :
   ```powershell
   & "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe" list   # doit montrer qwen3.5:27b
   ```
2. **Tunnels SSH vers la DB** (Postgres `gk-db` non exposé sur le serveur). Le supervisor
   maintient DEUX tunnels pour répartir la charge (un seul forward sérialise tout le trafic) :
   ```bash
   ssh -N -o ServerAliveInterval=30 -L 0.0.0.0:5433:172.24.0.3:5432 noob-serveur  # jobs légers
   ssh -N -o ServerAliveInterval=30 -L 0.0.0.0:5434:172.24.0.3:5432 noob-serveur  # jobs DB-lourds
   ```
   5433 = discover/verify/helloasso/fb ; 5434 = liveness/events + bloc périodique apply/press/
   reap/score. (172.24.0.3 = IP du conteneur `gk-db` ; re-vérifier avec
   `ssh noob-serveur "docker exec gk-db hostname -i"`. Les scripts/diag ad-hoc utilisent 5433.)
3. **venv** : `.venv` ici, deps `psycopg[binary] ddgs httpx readability-lxml ollama`.

Variables d'env (défauts entre parenthèses) :
`DATABASE_URL` (postgres://gemenskarte:gemenskarte@localhost:5433/gemenskarte),
`OLLAMA_HOST` (http://localhost:11434), `VERIFY_MODEL` (qwen3.5:27b).

## Ordre d'exécution

Toujours valider sur un département (`--dept 85`) avant le run complet.

```powershell
$py = ".\.venv\Scripts\python.exe"

# 0. (auto) apply.py archive l'ancien social dans meta.legacy à la 1re passe.

# 1. DÉCOUVERTE — DDG, ~2-8 s/asso. Reprenable : relancer reprend où ça s'est arrêté.
& $py discover.py                      # tout ; ou --dept 85 ; ou --limit N

# 2. VÉRIF LLM — le plus lent. Fetch sites + jugement Ollama.
& $py verify_llm.py                    # tout ; --max-sites 2 par défaut

# 3. PRESSE — filtre avis de décès / titres malformés (DB pur, rapide).
& $py press_filter.py

# 4. APPLY & ROUTE — DB pur, déterministe, rejouable. Réécrit `social`.
#    Inclut une GATE liveness : retire de social un lien confirmé mort (meta.linkHealth).
& $py apply.py                         # seuils --apply-th 0.75 --quar-th 0.40

# 5. LIVENESS — check HTTP parallèle (website+helloasso ; jamais FB/IG/LI). -> meta.linkHealth
& $py liveness.py                      # --workers 32 --max-age 14 --suspect-age 1

# 6. REAPER — retire les liens MORTS confirmés (colonne website + social) -> meta.deadRemoved
& $py reap_dead.py                     # --min-fails 2 --min-age-hours 12 (404/410 immédiats)

# 7. SCORE — qualité/fraîcheur par fiche (0-100 + tier A/B/C/D + flags) -> meta.qualityScore
& $py score.py                         # --all pour recalcul total (sinon gating incrémental)

# 8. EVENTS — agenda à venir via API OpenAgenda/Opendatasoft (géo par commune) -> meta.events
& $py events.py                        # --radius 12 --max-age 3 --cap 6 ; --redo pour tout refaire

# 9. FB->SITE — pour les fiches FB-only, extrait un site CANDIDAT du snippet DDG de la page FB.
#    -> meta.fbWebsite (candidat, à vérifier avant affichage). Trickle gentil (DDG partagé).
& $py fb_website.py --limit 10 --sleep 4 --apply
# 9b. PROMOTE — vérifie le candidat fbWebsite par LLM (fetch+juge) ; si OK -> colonne curée website.
& $py fb_promote.py --limit 30          # min-conf 0.7 ; gating fbWebsitePromotedAt

# 3b. PRESSE — filtre ÉDITORIAL (PAS de liveness : 403 anti-bot OF/actu = faux morts).
#     Extrait la date (UUID v1 dans l'URL OF + préfixe snippet DDG "Mon DD, YYYY"/"N days ago"),
#     écrit art.publishedAt, retire : périmé >--stale-years (3 ans), pages d'atterrissage
#     commune OF (.../ville-85xxx/), home maville, pages ANNUAIRE infolocale (sans /article-).
#     Garde les infolocale .../article-... = annonces d'événements (réutiles au chantier events).
& $py press_filter.py                  # --stale-years 3

# Stats / contrôle à tout moment :
& $py stats.py
```

## Liens morts — chaîne liveness (SCRAP 5→6) et cohérence avec apply

`liveness.py` vérifie la disponibilité RÉELLE de `website` (colonne curée prioritaire, sinon
social.website) et `helloasso`. **Jamais** FB/IG/LI : ces pages renvoient 403 à tout crawler,
un échec n'y prouve rien (on garde le jugement LLM titre+snippet). Classement par lien :
`alive` (2xx/3xx) · `dead` (404/410/connexion impossible, double-checké) · `blocked` (403/429,
non concluant) · `error` (timeout/5xx). Écrit `meta.linkHealth{plat:{url,status,httpCode,
checkedAt,consecutiveFailures,firstFailAt}}` + `meta.linkHealthAt`. Gating 2 vitesses :
lien sain re-vérifié à `max-age` (14j), lien suspect à `suspect-age` (1j).

Retrait (deux mécanismes COHÉRENTS, jamais en conflit) :
 - colonne curée `website` : apply n'y touche jamais -> `reap_dead.py` la NULLifie.
 - `social.website`/`helloasso` : la gate d'`apply.py` les retire au rebuild ; `reap_dead.py`
   les retire aussi directement (pour les fiches non encore vérifiées). Les deux convergent.
Sécurité anti-faux-positif : 404/410 retirés tout de suite ; ConnectError/timeout seulement
après panne persistante ≥ `min-age-hours` (12h). Tout retrait est tracé dans `meta.deadRemoved`.

## Agenda à venir (SCRAP 8) — pourquoi PAS infolocale

infolocale.ouest-france.fr (et infolocale.fr) renvoient **403 anti-bot sur 100 %** des URLs
(même mur que les 403 presse) -> scraping direct impossible. Pivot vers le dataset PUBLIC
`evenements-publics-openagenda` de public.opendatasoft.com : API REST **sans auth**, licence
ouverte, ~1,1 M événements, filtrable **géo + date**. `events.py` fait 1 requête par commune
(within_distance du centroïde, firstdate_begin>=now), puis rattache à chaque asso :
 - événements MATCHÉS (>=2 tokens distinctifs >=5 car. du nom dans titre/desc/keywords) ;
 - complétés par l'agenda de proximité commune (matchedAsso=false) -> jamais vide.
Le match est volontairement HAUTE PRÉCISION (un seul mot commun, même "publique"/"orgue", est
trop ambigu -> on s'abstient et on tombe dans le fallback commune). Le score crédite la présence
d'un agenda à venir (fraîcheur/vitalité, flags has_agenda / agenda_asso).

Pour un run de fond long, lancer dans une fenêtre PowerShell dédiée (ne pas fermer le tunnel) :
`Start-Process` ou simplement laisser tourner ; les passes 1 et 2 sont reprenables.

## Logique de routage (apply.py)

```
social :  score = 0.35·prior(match_type) + 0.65·confiance_LLM     (réseaux)
          score = 0.25·prior(score_site) + 0.75·confiance_LLM     (site, page lue)
          HelloAsso = fiable (score 1.0, jamais vérifié LLM)

  score ≥ 0.75            → social{}        (appliqué)
  0.40 ≤ score < 0.75     → meta.quarantine (revue humaine)
  score < 0.40 OU drop    → jeté (tracé dans meta.dropped)
```

prior(match_type) : slug .90 | top1 .70 | slug_sub .60 | slug_city .55 | top2 .50 | top3 .35 | title .30 | fallback .10

## Revue manuelle de la quarantaine

À brancher dans l'app web (réutiliser le pattern de `apps/web/src/components/AdminReview.tsx`) :
lister les fiches `meta.quarantine <> '{}'`, pour chaque lien Garder/Jeter → endpoint API qui
déplace vers `social` ou ajoute à `meta.dropped`.

## Rollback

L'ancien état est dans `meta.legacy` :
```sql
UPDATE associations SET social = meta->'legacy'->'social' WHERE meta ? 'legacy';
```
