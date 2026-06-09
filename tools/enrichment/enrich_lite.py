"""Passe B (spike léger) — pour un échantillon d'associations, trouve le site officiel
+ les réseaux sociaux via une recherche web (DuckDuckGo) + heuristiques de matching.

Beaucoup plus rapide que ScrapeGraphAI/SearchGraph : pas de Playwright, pas de RAG
multi-appels. ~1-3 s/asso. Validation LLM optionnelle (Ollama) avec --llm.

Usage:
  python enrich_lite.py [--limit N] [--offset N] [--llm] [--in sample.json] [--out results_lite.json]
"""

import argparse
import json
import re
import sys
import time
import unicodedata
from pathlib import Path
from urllib.parse import urlparse

from ddgs import DDGS

HERE = Path(__file__).parent

# Domaines réseaux sociaux / plateformes asso reconnues.
SOCIAL_HOSTS = {
    "facebook.com": "facebook",
    "fb.com": "facebook",
    "instagram.com": "instagram",
    "twitter.com": "twitter",
    "x.com": "twitter",
    "linkedin.com": "linkedin",
    "youtube.com": "youtube",
    "youtu.be": "youtube",
    "tiktok.com": "tiktok",
    "helloasso.com": "helloasso",
}

# Annuaires / agrégateurs : utiles comme indices mais jamais "site officiel".
DIRECTORY_HOSTS = {
    "net1901.org", "journal-officiel.gouv.fr", "data.gouv.fr", "societe.com",
    "pappers.fr", "annuaire-asso.fr", "asso1901.com", "infogreffe.fr",
    "verif.com", "manageo.fr", "pagesjaunes.fr", "annuaire-mairie.fr",
    "le-compte-asso.associations.gouv.fr", "associations.gouv.fr",
    "wikipedia.org", "facebook.com", "instagram.com",  # déjà gérés comme social
    "assoce.fr", "gralon.net", "toutsurmacommune.fr", "annuairefrancais.fr",
    "linternaute.com", "repertoiredesassociations.fr", "annuaire-des-associations.com",
    "association.tel", "vernalis.fr", "guide-de-la-vendee.com", "infogreffe.fr",
    # presse / actu : mentionnent l'asso mais ne sont pas son site
    "ouest-france.fr", "actu.fr", "lefigaro.fr", "letelegramme.fr",
    "infolocale.ouest-france.fr", "petitbleu.fr", "lanouvellerepublique.fr",
}

STOPWORDS = {
    "association", "asso", "amicale", "club", "comite", "comites", "comite",
    "de", "des", "du", "la", "le", "les", "et", "d", "l", "aux", "au", "pour",
    "sport", "sports", "section", "union", "loisirs", "loisir",
}


def strip_accents(s: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c)
    )


def tokens(s: str) -> set[str]:
    s = strip_accents(s).lower()
    raw = re.split(r"[^a-z0-9]+", s)
    return {t for t in raw if t and t not in STOPWORDS and len(t) > 1}


def host_of(url: str) -> str:
    h = (urlparse(url).hostname or "").lower()
    return h[4:] if h.startswith("www.") else h


def base_domain(host: str) -> str:
    parts = host.split(".")
    return ".".join(parts[-2:]) if len(parts) >= 2 else host


# Sites de mairies / communautés de communes : pas le "site de l'asso", mais
# une liste d'assos exploitable en Passe A. On les repère et on les remonte à part.
MAIRIE_HINTS = ("mairie", "commune", "ville-", "ville.", "cc-", "ccpm", "agglo")


def looks_like_youtube_video(url: str) -> bool:
    return "watch?v=" in url or "youtu.be/" in url


# Premiers segments d'URL qui ne sont PAS un nom de page (à ignorer comme slug).
_FB_NON_PAGE = {"sharer", "events", "watch", "login", "search", "marketplace",
                "story.php", "photo.php", "media", "hashtag", "permalink.php"}


def normalize_social(platform: str, url: str) -> dict | None:
    """Réduit une URL sociale à sa racine de page + extrait le 'slug' identifiant.
    Renvoie {url, slug} ou None si l'URL n'est pas une page exploitable."""
    p = urlparse(url)
    parts = [seg for seg in p.path.split("/") if seg]
    host = host_of(url)

    if platform in ("facebook",):
        if not parts:
            return None
        if parts[0] == "people" and len(parts) >= 2:           # /people/<Nom>/<id>/
            return {"url": f"https://www.facebook.com/people/{parts[1]}/{parts[2]}/"
                    if len(parts) >= 3 else url, "slug": parts[1]}
        if parts[0] == "pages" and len(parts) >= 2:
            return {"url": url, "slug": parts[-2] if len(parts) >= 2 else parts[-1]}
        if parts[0] in _FB_NON_PAGE or parts[0].endswith(".php"):
            return None
        return {"url": f"https://www.facebook.com/{parts[0]}/", "slug": parts[0]}

    if platform == "instagram":
        if not parts or parts[0] in ("p", "reel", "explore", "stories"):
            return None
        return {"url": f"https://www.instagram.com/{parts[0]}/", "slug": parts[0]}

    if platform == "helloasso":
        if "associations" in parts:
            i = parts.index("associations")
            if i + 1 < len(parts):
                return {"url": f"https://www.helloasso.com/associations/{parts[i+1]}",
                        "slug": parts[i + 1]}
        return None

    if platform == "linkedin":
        if parts and parts[0] in ("company", "school", "in") and len(parts) >= 2:
            return {"url": f"https://www.linkedin.com/{parts[0]}/{parts[1]}/", "slug": parts[1]}
        return None

    if platform == "youtube":
        if parts and (parts[0].startswith("@") or parts[0] in ("c", "channel", "user")):
            return {"url": url, "slug": parts[-1].lstrip("@")}
        return None

    if platform == "twitter":
        if parts and parts[0] not in ("search", "hashtag", "i", "intent"):
            return {"url": f"https://twitter.com/{parts[0]}", "slug": parts[0]}
        return None

    return {"url": url, "slug": "/".join(parts)}


def classify(asso: dict, results: list[dict]) -> dict:
    name_tok = tokens(asso["name"])
    city_tok = tokens(asso.get("city") or "")
    # Tokens "discriminants" : on retire la ville pour ne pas matcher n'importe quoi
    # de la commune. Un vrai site d'asso partage le NOM, pas juste la ville.
    disc_tok = name_tok - city_tok

    socials: dict[str, dict] = {}
    website_candidates: list[dict] = []
    mairie_listings: list[dict] = []

    for r in results:
        url = r.get("href") or r.get("url") or ""
        title = r.get("title") or ""
        if not url:
            continue
        host = host_of(url)
        bdom = base_domain(host)

        # Réseau social ? On exige une correspondance de nom (titre OU chemin d'URL)
        # pour éviter les vidéos/pages random, et on jette les vidéos YouTube.
        platform = SOCIAL_HOSTS.get(bdom)
        if platform:
            if platform == "youtube" and looks_like_youtube_video(url):
                continue
            norm = normalize_social(platform, url)
            if not norm:
                continue
            slug_tok = tokens(norm["slug"])
            title_tok = tokens(title)
            # Fiable : le nom est dans le SLUG de la page (pas juste cité dans un post),
            # ou fortement présent dans le titre (≥2 tokens discriminants).
            strong = disc_tok and (
                bool(disc_tok & slug_tok) or len(disc_tok & title_tok) >= 2
            )
            if strong:
                socials.setdefault(
                    platform,
                    {"url": norm["url"], "title": title,
                     "match": "slug" if (disc_tok & slug_tok) else "title"},
                )
            continue

        # Site de mairie / comcom → signal Passe A (liste d'assos de la commune).
        if any(h in host for h in MAIRIE_HINTS) or (
            city_tok and city_tok & tokens(host.replace(".", " "))
            and host.endswith(".fr") and bdom not in DIRECTORY_HOSTS
        ):
            mairie_listings.append({"url": url, "host": host, "title": title})
            continue

        if bdom in DIRECTORY_HOSTS:
            continue  # annuaire : ni site officiel ni mairie

        # Candidat site officiel : score sur les tokens DISCRIMINANTS (hors ville).
        dom_tok = tokens(host.replace(".", " "))
        title_tok = tokens(title)
        name_in_domain = len(disc_tok & dom_tok)
        name_in_title = len(disc_tok & title_tok)
        city_match = 1 if (city_tok and city_tok & (dom_tok | title_tok)) else 0
        # Score : il faut du NOM. La ville seule ne suffit jamais.
        score = name_in_domain * 3 + name_in_title + city_match
        website_candidates.append(
            {"url": url, "host": host, "title": title, "score": score,
             "name_in_domain": name_in_domain, "name_in_title": name_in_title}
        )

    website_candidates.sort(key=lambda c: c["score"], reverse=True)
    # Site officiel : confiance haute UNIQUEMENT si le NOM est dans le domaine.
    # (un match titre-seul = simple mention presse/annuaire, peu fiable.)
    official = next((c for c in website_candidates if c["name_in_domain"] >= 1), None)
    # Mentions : domaine sans le nom mais titre qui matche le nom → info, pas un site.
    mentions = [c for c in website_candidates if c["name_in_domain"] == 0 and c["name_in_title"] >= 2]

    return {
        "website": official["url"] if official else None,
        "website_score": official["score"] if official else 0,
        "socials": {k: v["url"] for k, v in socials.items()},
        # détail (url + type de match) pour l'auto-apply industriel
        "socials_detail": {k: {"url": v["url"], "match": v["match"]} for k, v in socials.items()},
        "mairie_listings": mairie_listings[:3],
        "mentions": [{"url": m["url"], "title": m["title"]} for m in mentions[:3]],
        "candidates": website_candidates[:5],
    }


def search(query: str, max_results: int = 10) -> list[dict]:
    with DDGS() as ddgs:
        return list(ddgs.text(query, region="fr-fr", max_results=max_results))


def enrich_one(asso: dict) -> dict:
    name = asso["name"]
    city = asso.get("city") or ""
    started = time.time()
    out = {"error": None}
    try:
        results = search(f"{name} {city} association Vendée")
        out.update(classify(asso, results))
        out["n_results"] = len(results)
    except Exception as exc:
        out["error"] = f"{type(exc).__name__}: {exc}"
    out["elapsed_s"] = round(time.time() - started, 1)
    return out


def main() -> int:
    # Console Windows (cp1252) → on force l'UTF-8 pour les noms accentués.
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=50)
    ap.add_argument("--offset", type=int, default=0)
    ap.add_argument("--in", dest="infile", default=str(HERE / "sample.json"))
    ap.add_argument("--out", dest="outfile", default=str(HERE / "results_lite.json"))
    args = ap.parse_args()

    assos = json.loads(Path(args.infile).read_text(encoding="utf-8"))
    batch = assos[args.offset : args.offset + args.limit]
    print(f"Recherche pour {len(batch)} associations (sur {len(assos)})...", flush=True)

    out = []
    for i, asso in enumerate(batch, 1):
        enriched = enrich_one(asso)
        flag = (
            "ERR" if enriched["error"]
            else f"site={'OUI' if enriched.get('website') else 'non'} "
                 f"socials={','.join(enriched.get('socials', {})) or '-'} "
                 f"mairie={len(enriched.get('mairie_listings', []))}"
        )
        print(f"  [{i}/{len(batch)}] {asso['name'][:40]:40} {enriched['elapsed_s']}s  {flag}", flush=True)
        out.append({**asso, **enriched})
        Path(args.outfile).write_text(
            json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8"
        )

    with_site = sum(1 for r in out if r.get("website"))
    with_social = sum(1 for r in out if r.get("socials"))
    with_mairie = sum(1 for r in out if r.get("mairie_listings"))
    errs = sum(1 for r in out if r["error"])
    print(
        f"\nTerminé: {len(out)} assos | site trouvé: {with_site} | "
        f"réseaux trouvés: {with_social} | liste mairie/comcom: {with_mairie} | "
        f"erreurs: {errs}\n-> {args.outfile}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
