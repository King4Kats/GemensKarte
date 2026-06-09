"""Helpers de matching partagés (SCRAP 1-4).

Extraits et DURCIS depuis l'ancien tools/enrichment/enrich_lite.py :
 - rejets structurels à la collecte (FB id numérique, /people/, /groups/, slug court,
   tiktok /discover/) ;
 - blacklist annuaires/presse élargie (apec.fr, pagesjaunes...) ;
 - classify() émet désormais un candidat par lien AVEC title + snippet + match_type + rank,
   pour que la vérif LLM (SCRAP 2) puisse juger les réseaux sociaux bloqués.

Aucune écriture DB ici : pur calcul, testable hors-ligne.
"""

from __future__ import annotations

import re
import unicodedata
from urllib.parse import urlparse

# ---------------------------------------------------------------------------
# Domaines

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

# Annuaires / agrégateurs / presse : jamais "site officiel".
DIRECTORY_HOSTS = {
    "net1901.org", "journal-officiel.gouv.fr", "data.gouv.fr", "societe.com",
    "pappers.fr", "annuaire-asso.fr", "asso1901.com", "infogreffe.fr",
    "verif.com", "manageo.fr", "pagesjaunes.fr", "annuaire-mairie.fr",
    "le-compte-asso.associations.gouv.fr", "associations.gouv.fr",
    "wikipedia.org", "assoce.fr", "gralon.net", "toutsurmacommune.fr",
    "annuairefrancais.fr", "linternaute.com", "repertoiredesassociations.fr",
    "annuaire-des-associations.com", "association.tel", "vernalis.fr",
    "guide-de-la-vendee.com", "infolocale.fr", "infolocale.ouest-france.fr",
    # ajouts audit : faux positifs sites web
    "apec.fr", "centre.apec.fr", "indeed.com", "indeed.fr", "leboncoin.fr",
    "yelp.fr", "yelp.com", "trustpilot.com", "kompass.com", "hoodspot.fr",
    "cylex-france.fr", "118000.fr", "telephone-annuaire.fr", "justacote.com",
    "francebleu.fr", "tripadvisor.fr", "tripadvisor.com",
    # presse régionale (mentions, pas site)
    "ouest-france.fr", "actu.fr", "lefigaro.fr", "letelegramme.fr",
    "lanouvellerepublique.fr", "petitbleu.fr", "presse-ocean.com",
    "vendeematin.fr", "le-courrier-de-louest.fr", "maville.com",
    # cartographie / annuaires d'assos (se font passer pour un site web)
    "mappy.com", "mappy.fr", "cerfapp.fr", "cerfapp.com",
}

STOPWORDS = {
    "association", "asso", "amicale", "club", "comite", "comites",
    "de", "des", "du", "la", "le", "les", "et", "d", "l", "aux", "au", "pour",
    "sport", "sports", "section", "union", "loisirs", "loisir",
}

MAIRIE_HINTS = ("mairie", "commune", "ville-", "ville.", "cc-", "ccpm", "agglo")

# Premiers segments FB qui ne sont PAS un nom de page.
_FB_NON_PAGE = {
    "sharer", "events", "watch", "login", "search", "marketplace",
    "story.php", "photo.php", "media", "hashtag", "permalink.php", "groups",
    "profile.php", "reel", "reels", "video", "videos",
}

# Slug réseau social trop court = page générique → rejet.
MIN_SLUG_LEN = 4


# ---------------------------------------------------------------------------
# Texte

def strip_accents(s: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c)
    )


def tokens(s: str) -> set[str]:
    s = strip_accents(s or "").lower()
    raw = re.split(r"[^a-z0-9]+", s)
    return {t for t in raw if t and t not in STOPWORDS and len(t) > 1}


def host_of(url: str) -> str:
    h = (urlparse(url).hostname or "").lower()
    return h[4:] if h.startswith("www.") else h


def base_domain(host: str) -> str:
    parts = host.split(".")
    return ".".join(parts[-2:]) if len(parts) >= 2 else host


def looks_like_youtube_video(url: str) -> bool:
    return "watch?v=" in url or "youtu.be/" in url


_NUMERIC_ID = re.compile(r"^\d{6,}$")


def normalize_social(platform: str, url: str) -> dict | None:
    """Réduit une URL sociale à sa racine + slug, en REJETANT les pages non exploitables.
    Renvoie {url, slug} ou None (rejet structurel)."""
    p = urlparse(url)
    parts = [seg for seg in p.path.split("/") if seg]

    if platform == "facebook":
        if not parts:
            return None
        first = parts[0]
        # /people/<Nom>/<id> = profil personne physique → rejet (faux positif certain).
        if first == "people":
            return None
        if first in _FB_NON_PAGE or first.endswith(".php"):
            return None
        if first == "pages" and len(parts) >= 3:
            # /pages/<Nom>/<id> : garder le NOM, mais rejeter si id seul / nom vide.
            slug = parts[1]
            if _NUMERIC_ID.match(slug) or len(slug) < MIN_SLUG_LEN:
                return None
            return {"url": f"https://www.facebook.com/{slug}/", "slug": slug}
        # /<id numérique>/ = page de lieu/ville → rejet (le pire faux positif, 1111 cas).
        if _NUMERIC_ID.match(first):
            return None
        if len(first) < MIN_SLUG_LEN:
            return None
        return {"url": f"https://www.facebook.com/{first}/", "slug": first}

    if platform == "instagram":
        if not parts or parts[0] in ("p", "reel", "reels", "explore", "stories", "tv"):
            return None
        slug = parts[0]
        if len(slug) < MIN_SLUG_LEN:
            return None
        return {"url": f"https://www.instagram.com/{slug}/", "slug": slug}

    if platform == "helloasso":
        if "associations" in parts:
            i = parts.index("associations")
            if i + 1 < len(parts):
                return {"url": f"https://www.helloasso.com/associations/{parts[i+1]}",
                        "slug": parts[i + 1]}
        return None

    if platform == "linkedin":
        # /company/ et /school/ uniquement. /in/ = profil personnel → REJET.
        if parts and parts[0] in ("company", "school") and len(parts) >= 2:
            return {"url": f"https://www.linkedin.com/{parts[0]}/{parts[1]}/", "slug": parts[1]}
        return None

    if platform == "youtube":
        if parts and (parts[0].startswith("@") or parts[0] in ("c", "channel", "user")):
            return {"url": url, "slug": parts[-1].lstrip("@")}
        return None

    if platform == "tiktok":
        # /@handle uniquement. /discover/, /tag/, /video/ → rejet.
        if parts and parts[0].startswith("@") and len(parts[0]) > MIN_SLUG_LEN:
            return {"url": f"https://www.tiktok.com/{parts[0]}", "slug": parts[0].lstrip("@")}
        return None

    if platform == "twitter":
        if parts and parts[0] not in ("search", "hashtag", "i", "intent", "home"):
            return {"url": f"https://twitter.com/{parts[0]}", "slug": parts[0]}
        return None

    return {"url": url, "slug": "/".join(parts)}


def _sub_tokens(slug: str) -> set[str]:
    """Tokens d'un slug en le coupant aussi sur les séparteurs collés (camel ignoré)."""
    return tokens(re.sub(r"[._\-]+", " ", slug))


def _social_match_type(disc_tok, city_tok, slug, title, rank: int) -> str | None:
    """Décide le match_type d'un candidat social, ou None s'il faut le jeter d'emblée.

    Taxonomie (= prior de confiance en SCRAP 4) :
      slug      : un token discriminant du nom est DANS le slug
      slug_sub  : token présent seulement après découpe -/_/. du slug
      slug_city : seule la ville matche le slug (faible)
      title     : nom fortement présent dans le titre (>=2 tokens disc.)
      top1/2/3  : pas de match nom/slug, mais résultat bien classé par DDG
      fallback  : 1 seul token, mal classé → douteux (vérif LLM tranche)
    """
    slug_tok = tokens(slug)
    sub_tok = _sub_tokens(slug)
    title_tok = tokens(title)

    if disc_tok & slug_tok:
        return "slug"
    if disc_tok & sub_tok:
        return "slug_sub"
    if len(disc_tok & title_tok) >= 2:
        return "title"
    if city_tok and (city_tok & slug_tok or city_tok & sub_tok):
        return "slug_city"
    n_title = len(disc_tok & title_tok)
    if n_title >= 1 and rank <= 3:
        return f"top{rank}"
    if n_title >= 1:
        return "fallback"
    return None  # aucun signal de nom → on ne retient pas ce candidat social


def classify(asso: dict, results: list[dict]) -> dict:
    """Transforme les résultats DDG bruts en candidats structurés (1 par lien retenu).

    `results` = liste de dicts DDG {title, href, body}. `rank` = position 1..N.
    Renvoie {socialCandidates, websiteCandidates, mairieListings, mentions}.
    AUCUN choix définitif ici : on remonte tous les candidats plausibles + leur match_type.
    La vérif LLM (SCRAP 2) et l'apply (SCRAP 4) trancheront.
    """
    name_tok = tokens(asso.get("name"))
    city_tok = tokens(asso.get("city") or "")
    disc_tok = name_tok - city_tok  # tokens discriminants (hors ville)

    social_cands: list[dict] = []
    website_cands: list[dict] = []
    mairie_listings: list[dict] = []
    seen_social: set[tuple[str, str]] = set()

    for rank, r in enumerate(results, 1):
        url = r.get("href") or r.get("url") or ""
        title = r.get("title") or ""
        snippet = r.get("body") or r.get("snippet") or ""
        if not url:
            continue
        host = host_of(url)
        bdom = base_domain(host)

        platform = SOCIAL_HOSTS.get(bdom)
        if platform:
            if platform == "youtube" and looks_like_youtube_video(url):
                continue
            norm = normalize_social(platform, url)
            if not norm:
                continue  # rejet structurel
            if not disc_tok:
                continue
            mt = _social_match_type(disc_tok, city_tok, norm["slug"], title, rank)
            if mt is None:
                continue
            key = (platform, norm["url"])
            if key in seen_social:
                continue
            seen_social.add(key)
            social_cands.append({
                "platform": platform, "url": norm["url"], "slug": norm["slug"],
                "match_type": mt, "rank": rank, "title": title, "snippet": snippet,
            })
            continue

        # Mairie / comcom → liste d'assos (signal annexe).
        if any(h in host for h in MAIRIE_HINTS) or (
            city_tok and city_tok & tokens(host.replace(".", " "))
            and host.endswith(".fr") and bdom not in DIRECTORY_HOSTS
        ):
            mairie_listings.append({"url": url, "host": host, "title": title})
            continue

        if bdom in DIRECTORY_HOSTS:
            continue

        # Candidat site officiel : score sur tokens discriminants (la ville seule ne suffit pas).
        dom_tok = tokens(host.replace(".", " "))
        title_tok = tokens(title)
        # Match exact par token OU sous-chaîne (domaines collés type "patinageyonnais.fr").
        dom_flat = strip_accents(host).lower().replace(".", "")
        name_in_domain = len(disc_tok & dom_tok) + sum(
            1 for t in disc_tok if t not in dom_tok and len(t) >= 4 and t in dom_flat
        )
        name_in_title = len(disc_tok & title_tok)
        city_match = 1 if (city_tok and city_tok & (dom_tok | title_tok)) else 0
        score = name_in_domain * 3 + name_in_title + city_match
        website_cands.append({
            "url": url, "host": host, "title": title, "snippet": snippet,
            "score": score, "rank": rank,
            "name_in_domain": name_in_domain, "name_in_title": name_in_title,
        })

    website_cands.sort(key=lambda c: (c["score"], -c["rank"]), reverse=True)
    mentions = [
        {"url": c["url"], "title": c["title"]}
        for c in website_cands if c["name_in_domain"] == 0 and c["name_in_title"] >= 2
    ][:3]

    return {
        "socialCandidates": social_cands,
        "websiteCandidates": website_cands[:5],
        "mairieListings": mairie_listings[:3],
        "mentions": mentions,
    }
