"""Passe A — Scraper de pages mairie/comcom.

Pour chaque URL mairieListings unique (non-annuaire tiers) collectée en Passe B :
1. Fetch + parse HTML → extraire les noms d'associations présentes sur la page.
2. Croiser avec notre DB par similarité pg_trgm + même département.
3. Résultats :
   - Assos trouvées ET matchées → meta.mairieA.matchedIds mis à jour.
   - Noms sans correspondance RNA → fichier `mairie_candidates.jsonl` (potentiels absents).
4. Idempotent : URLs déjà scrapées ignorées sauf --redo.

Usage:
  python scrape_mairie.py [--limit-urls N] [--dry-run] [--redo] [--sleep 2.0]
"""

import argparse
import json
import os
import re
import sys
import time
import unicodedata
import random
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

import psycopg
import requests
from bs4 import BeautifulSoup

HERE = Path(__file__).parent

DSN = os.environ.get(
    "DATABASE_URL", "postgres://gemenskarte:gemenskarte@localhost:5432/gemenskarte"
)

CANDIDATES_OUT = HERE / "mairie_candidates.jsonl"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (X11; Linux x86_64; rv:124.0) Gecko/20100101 Firefox/124.0 "
        "(GemensKarte enrichissement associatif; contact@gemenskarte.fr)"
    ),
    "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.3",
}

FETCH_TIMEOUT = 15  # secondes

# Annuaires / agrégateurs tiers et portails non-asso : on les saute.
# Supporte les sous-domaines : "maville.com" bloque aussi "challans.maville.com".
SKIP_HOSTS = {
    # annuaires tiers (données non originales)
    "annuaire-mairie.fr", "toutsurmacommune.fr", "bien-dans-ma-ville.fr",
    "la-mairie.com", "annuaire-des-associations.com", "net1901.org",
    "asso1901.com", "linternaute.com", "annuaire-asso.fr", "hoodspot.fr",
    "annuaire-francais.fr",
    # portails news/urban — pas d'annuaires asso exploitables
    "maville.com",
    # sites admin intercommunaux — pas des pages d'assos
    "maisondescommunes85.fr",
    # agrégateurs communes généralistes
    "communes.com", "commune.fr",
    # tourisme / OT — pas des assos
    "ile-yeu.fr", "vendee-tourisme.com",
}

def should_skip(host: str) -> bool:
    """Vérifie le host ET ses parents (ex. *.maville.com)."""
    if host in SKIP_HOSTS:
        return True
    # Vérifie chaque suffixe : "city.maville.com" → match "maville.com"
    parts = host.split(".")
    for i in range(1, len(parts)):
        if ".".join(parts[i:]) in SKIP_HOSTS:
            return True
    return False

ASSO_KEYWORDS = {
    "association", "asso", "club", "amicale", "société", "comité",
    "union", "fédération", "section", "ligue", "cercle", "foyer",
    "groupement", "collectif",
}

STOPWORDS = {
    "association", "asso", "amicale", "club", "comite", "comites",
    "de", "des", "du", "la", "le", "les", "et", "d", "l", "aux", "au",
    "pour", "sport", "sports", "section", "union", "loisirs", "loisir",
}


# ---------------------------------------------------------------------------
# Normalisation
# ---------------------------------------------------------------------------

def strip_accents(s: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c)
    )


def normalize_name(name: str) -> str:
    """Clé de dédup / matching : sans accents, majuscules, sans ponctuation."""
    s = strip_accents(name.upper())
    s = re.sub(r"[^A-Z0-9 ]+", " ", s)
    words = [w for w in s.split() if w not in {w.upper() for w in STOPWORDS} or len(w) > 4]
    return " ".join(words).strip()


def host_of(url: str) -> str:
    h = (urlparse(url).hostname or "").lower()
    return h[4:] if h.startswith("www.") else h


# ---------------------------------------------------------------------------
# Heuristique : ce texte ressemble-t-il à un nom d'association ?
# ---------------------------------------------------------------------------

# Phrases / mots qui signalent du bruit de navigation ou contenu éditorial
NOISE_PATTERNS = re.compile(
    r"(conditions|mentions légales|légales|copyright|politique de|"
    r"plan du site|nous contacter|en savoir plus|voir plus|lire la suite|"
    r"actualité|à l.affiche|sorties de|films|cinéma|agenda\b|"
    r"modèles|catalogue|prestations|collectivit|annuaire des|"
    r"skip to|histoire de|circuits de|quais de|ruelles de|phare|"
    r"logement|emploi|impôts|finances|service des|mairie de|commune de|"
    r"proposer des|demande de logement|retrouvez toutes|"
    r"sport\s+\w+\s+(régional|national|local)|"  # "Sport La Roche" etc.
    r"en france|dans le monde|pôle emploi|"
    r"\bOT\b|©)",
    re.IGNORECASE
)

def looks_like_asso_name(text: str) -> bool:
    text = text.strip()
    if not text or len(text) < 6 or len(text) > 120:
        return False

    # Élimine les contenus avec caractères non-texte
    if re.search(r"[©@]|http", text):
        return False
    # Numéro de téléphone ou code postal
    if re.search(r"\d{2}[\s.\-]\d{2}[\s.\-]\d{2}", text):
        return False
    if re.match(r"^\d{2,}", text):
        return False
    # Bruit de navigation / éditorial
    if NOISE_PATTERNS.search(text):
        return False

    lower = text.lower()

    # Début typique de navigation
    for skip in ("accueil", "contact", "connexion", "newsletter",
                 "retour", "suite", "voir plus", "lire", "accès",
                 "télécharger", "imprimer", "partager", "envoyer"):
        if lower.startswith(skip):
            return False

    # ── Signaux FORTS (mot-clé asso explicite) ──
    if any(k in lower for k in ASSO_KEYWORDS):
        return True

    # ── Signal MOYEN : RNA-style tout-caps, au moins 3 mots, 12+ chars ──
    # (filtre "AGENDA 21" à 2 mots, "OT" etc.)
    if text == text.upper() and len(text.split()) >= 3 and len(text) >= 12:
        return True

    return False


# ---------------------------------------------------------------------------
# Extraction HTML
# ---------------------------------------------------------------------------

def extract_from_html(html: str, source_url: str) -> list[str]:
    """Extrait les noms d'assos candidats depuis une page mairie."""
    soup = BeautifulSoup(html, "html.parser")

    # Supprimer les éléments non-contenu
    for tag in soup(["script", "style", "noscript", "nav", "header",
                     "footer", "aside", "form", "button"]):
        tag.decompose()

    names: list[str] = []

    # Stratégie 1 — Tables (style annuaire mairie : Nom | Contact | Adresse)
    for table in soup.find_all("table"):
        rows = table.find_all("tr")
        if len(rows) < 2:
            continue
        # Détecter colonne "nom"
        header_cells = rows[0].find_all(["th", "td"])
        headers_text = [c.get_text(strip=True).lower() for c in header_cells]
        name_col = 0
        for i, h in enumerate(headers_text):
            if any(k in h for k in ("nom", "intitulé", "dénomination", "association", "titre")):
                name_col = i
                break
        for row in rows[1:]:
            cells = row.find_all(["td", "th"])
            if len(cells) > name_col:
                txt = cells[name_col].get_text(strip=True)
                if looks_like_asso_name(txt):
                    names.append(txt)

    # Stratégie 2 — Listes (ul/ol) — souvent le format des annuaires mairie
    for lst in soup.find_all(["ul", "ol"]):
        items = lst.find_all("li", recursive=False)
        if len(items) < 2:
            continue
        for item in items:
            # Le lien est souvent le nom, son texte > texte brut du li
            link = item.find("a")
            txt = (link or item).get_text(strip=True)
            # Parfois "Nom - Type - Contact" → prendre avant le 1er tiret
            txt = re.split(r"\s[–\-—]\s", txt)[0].strip()
            if looks_like_asso_name(txt):
                names.append(txt)

    # Stratégie 3 — Titres h2/h3 (assos avec leur propre section)
    for h in soup.find_all(["h2", "h3"]):
        txt = h.get_text(strip=True)
        if looks_like_asso_name(txt):
            names.append(txt)

    # Stratégie 4 — Éléments avec classe/id "association" ou "asso"
    for el in soup.find_all(
        lambda tag: tag.name in ("div", "article", "section", "li", "p")
        and any(
            kw in (tag.get("class") or [""])[0].lower()
            or kw in (tag.get("id") or "").lower()
            for kw in ("association", "asso", "club", "structure")
        )
    ):
        # Chercher un titre dans le bloc
        title_el = el.find(["h2", "h3", "h4", "strong", "b", "a"])
        if title_el:
            txt = title_el.get_text(strip=True)
            if looks_like_asso_name(txt):
                names.append(txt)

    # Dédup ordre-stable
    seen: set[str] = set()
    result: list[str] = []
    for n in names:
        key = normalize_name(n)
        if key and key not in seen:
            seen.add(key)
            result.append(n)

    return result


# ---------------------------------------------------------------------------
# Base de données
# ---------------------------------------------------------------------------

def load_pending_urls(conn, redo: bool) -> list[dict]:
    """URLs uniques à scraper, groupées par commune + département."""
    cond = "" if redo else "AND NOT (a.meta ? 'mairieA')"
    rows = conn.execute(
        f"""
        SELECT DISTINCT ON (ml->>'url')
            ml->>'url'   AS url,
            ml->>'host'  AS host,
            a.city       AS city,
            a.department AS department
        FROM associations a,
             jsonb_array_elements(a.meta->'enrichment'->'mairieListings') AS ml
        WHERE a.meta->'enrichment' ? 'mairieListings'
          AND jsonb_array_length(a.meta->'enrichment'->'mairieListings') > 0
          {cond}
        ORDER BY ml->>'url', a.city
        """
    ).fetchall()
    return [{"url": r[0], "host": r[1], "city": r[2], "dept": r[3]} for r in rows]


def cross_reference(conn, candidate_name: str, department: str) -> list[dict]:
    """Trouve les assos DB similaires dans le même département."""
    rows = conn.execute(
        """
        SELECT id, name, city,
               similarity(name, %s) AS sim
        FROM associations
        WHERE department = %s
          AND similarity(name, %s) > 0.3
        ORDER BY sim DESC
        LIMIT 3
        """,
        (candidate_name, department, candidate_name),
    ).fetchall()
    return [{"id": str(r[0]), "name": r[1], "city": r[2], "sim": round(r[3], 3)} for r in rows]


def mark_mairie_a(conn, url: str, city: str, department: str,
                  extracted: list[str], matches: list[dict], dry_run: bool) -> None:
    """Met à jour meta.mairieA de toutes les assos pointant vers cette URL."""
    payload = json.dumps({
        "mairieA": {
            "sourceUrl": url,
            "scrapedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "extractedCount": len(extracted),
            "matches": matches,
        }
    })
    if dry_run:
        return
    # Applique à toutes les assos dont mairieListings contient cette URL
    conn.execute(
        """
        UPDATE associations
        SET meta = meta || %s::jsonb
        WHERE meta->'enrichment'->'mairieListings' @> %s::jsonb
        """,
        (payload, json.dumps([{"url": url}])),
    )
    conn.commit()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--limit-urls", type=int, default=None, metavar="N",
                    help="Limiter à N URLs (test)")
    ap.add_argument("--dry-run", action="store_true", help="N'écrit rien en base")
    ap.add_argument("--redo", action="store_true", help="Re-scraper les URLs déjà traitées")
    ap.add_argument("--sleep", type=float, default=2.0,
                    help="Pause entre requêtes (défaut 2.0 s)")
    args = ap.parse_args()

    session = requests.Session()
    session.headers.update(HEADERS)

    with psycopg.connect(DSN, autocommit=False) as conn:
        all_urls = load_pending_urls(conn, args.redo)

        # Filtre annuaires tiers
        urls = [u for u in all_urls if u["host"] not in SKIP_HOSTS]
        skipped_dirs = len(all_urls) - len(urls)

        # Filtre PDFs
        urls = [u for u in urls if not u["url"].lower().endswith(".pdf")]
        if args.limit_urls:
            urls = urls[: args.limit_urls]

        total = len(urls)
        print(
            f"URLs à scraper : {total}  "
            f"(annuaires tiers ignorés : {skipped_dirs}, "
            f"dry-run={args.dry_run})",
            flush=True,
        )

        n_ok = n_err = n_empty = 0
        n_extracted_total = n_matched_total = n_new_total = 0

        seen_candidates: set[str] = set()
        with CANDIDATES_OUT.open("w", encoding="utf-8") as cand_fh:
            for i, entry in enumerate(urls, 1):
                url = entry["url"]
                city = entry["city"] or ""
                dept = entry["dept"] or ""
                t0 = time.time()

                # --- Fetch ---
                try:
                    resp = session.get(url, timeout=FETCH_TIMEOUT, allow_redirects=True)
                    resp.raise_for_status()
                    ct = resp.headers.get("content-type", "")
                    if "text/html" not in ct and "text/plain" not in ct:
                        print(
                            f"  [{i}/{total}] SKIP non-HTML ({ct[:30]}) {url[:60]}",
                            flush=True,
                        )
                        n_empty += 1
                        continue
                    html = resp.text
                except Exception as exc:
                    n_err += 1
                    print(
                        f"  [{i}/{total}] ERR fetch {type(exc).__name__}: {url[:60]}",
                        flush=True,
                    )
                    continue

                # --- Extract ---
                extracted = extract_from_html(html, url)

                if not extracted:
                    n_empty += 1
                    print(
                        f"  [{i}/{total}] vide  {url[:70]}  ({city})",
                        flush=True,
                    )
                    # On marque quand même pour ne pas re-scraper
                    mark_mairie_a(conn, url, city, dept, [], [], args.dry_run)
                    time.sleep(args.sleep * 0.5)
                    continue

                # --- Cross-reference ---
                matched: list[dict] = []
                unmatched: list[str] = []
                for name in extracted:
                    hits = cross_reference(conn, name, dept) if dept else []
                    if hits and hits[0]["sim"] >= 0.45:
                        matched.append({"candidate": name, "best": hits[0]})
                    else:
                        unmatched.append(name)
                        # Déduplique par (nom normalisé + ville)
                        dedup_key = normalize_name(name) + "|" + (city or "")
                        if dedup_key not in seen_candidates:
                            seen_candidates.add(dedup_key)
                            cand_fh.write(
                                json.dumps(
                                    {
                                        "rawName": name,
                                        "sourceUrl": url,
                                        "sourceCity": city,
                                        "dept": dept,
                                        "closestMatch": hits[0] if hits else None,
                                    },
                                    ensure_ascii=False,
                                )
                                + "\n"
                            )

                n_ok += 1
                n_extracted_total += len(extracted)
                n_matched_total += len(matched)
                n_new_total += len(unmatched)

                mark_mairie_a(conn, url, city, dept, extracted, matched, args.dry_run)

                dt = time.time() - t0
                print(
                    f"  [{i}/{total}] {dt:4.1f}s  "
                    f"extrait={len(extracted):3d}  "
                    f"matchés={len(matched):3d}  "
                    f"nouveaux={len(unmatched):3d}  "
                    f"{url[:60]}",
                    flush=True,
                )

                time.sleep(args.sleep + random.uniform(0, 0.8))

    print(
        f"\nFini : {total} URLs | ok={n_ok} | vide={n_empty} | err={n_err}\n"
        f"Noms extraits : {n_extracted_total} | matchés DB : {n_matched_total} "
        f"| candidats absents : {n_new_total}\n"
        f"Candidats écrits dans : {CANDIDATES_OUT}",
        flush=True,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
