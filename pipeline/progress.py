"""Suivi d'avancement des passes de découverte ciblées (discover_targeted.py). Lecture seule.

Affiche, pour chaque plateforme (facebook / instagram / helloasso / website), où en est la
passe : combien d'assos ont été scannées (marqueur posé), combien restent à faire, le % d'avancement
avec une petite barre, et combien de liens ont fini VALIDÉS dans la colonne `social`.

Idée : un coup d'œil pour savoir « les scripts en sont à 30 % sur la Vendée ».

Usage : python progress.py
Env   : DATABASE_URL (défaut tunnel local 5433)
"""

import argparse
import os
import psycopg

DSN = os.environ.get(
    "DATABASE_URL", "postgres://gemenskarte:gemenskarte@localhost:5433/gemenskarte"
)

# Pour chaque plateforme : la clé dans `social`, le marqueur d'idempotence posé par la passe, et
# si c'est une passe "sociale" (candidat dans socialCandidates) ou "site" (websiteCandidates).
PLATEFORMES = [
    ("facebook",  "facebook",  "fbTargetedAt",       "social"),
    ("instagram", "instagram", "igTargetedAt",       "social"),
    ("helloasso", "helloasso", "helloassoCheckedAt", "social"),
    ("website",   "website",   "webTargetedAt",      "site"),
]


def barre(pct: float, largeur: int = 24) -> str:
    """Petite barre de progression ASCII, ex: [##########--------------] 41%."""
    plein = int(round(pct / 100 * largeur))
    return "[" + "#" * plein + "-" * (largeur - plein) + f"] {pct:5.1f}%"


def construire_requete(dept: str | None) -> str:
    """Construit UNE seule requête (un seul balayage de table) qui compte, par plateforme :
    scannées (marqueur posé), restantes (mêmes conditions que fetch_pending), et validées (social).
    Si `dept` est fourni, on ne compte QUE ce département (ex. '85' = Vendée) — sinon toute la base."""
    morceaux = []
    for nom, col, marqueur, kind in PLATEFORMES:
        # restant = exactement les conditions de fetch_pending de discover_targeted.py
        cond_restant = [
            "location IS NOT NULL",
            f"NOT (COALESCE(social,'{{}}'::jsonb) ? '{col}')",
            f"(meta ? '{marqueur}') IS NOT TRUE",
        ]
        if kind == "social":
            # passes sociales : on saute aussi celles qui ont déjà un candidat de cette plateforme
            cond_restant.append(
                f"NOT (COALESCE(meta->'discovery'->'socialCandidates','[]'::jsonb) "
                f"@> '[{{\"platform\":\"{nom}\"}}]'::jsonb)"
            )
        # (passe site : aucune condition en plus, comme dans le code reciblé)
        where_restant = " AND ".join(cond_restant)
        morceaux.append(f"count(*) FILTER (WHERE meta ? '{marqueur}') AS {nom}_scan")
        morceaux.append(f"count(*) FILTER (WHERE {where_restant}) AS {nom}_rest")
        morceaux.append(f"count(*) FILTER (WHERE social ? '{col}') AS {nom}_val")
    morceaux.append("count(*) AS total")
    where = f" WHERE department = '{dept}'" if dept else ""
    return "SELECT " + ",\n       ".join(morceaux) + " FROM associations" + where


def main():
    ap = argparse.ArgumentParser()
    # Par défaut on suit la Vendée (85) — le territoire en cours d'enrichissement —
    # pour ne pas être noyé par les autres départements (ex. Occitanie, non scrapée).
    # --dept 31 pour un autre département ; --all pour toute la base.
    ap.add_argument("--dept", default="85")
    ap.add_argument("--all", action="store_true", help="compte toute la base (ignore --dept)")
    args = ap.parse_args()
    dept = None if args.all else args.dept

    with psycopg.connect(DSN) as c:
        cur = c.execute(construire_requete(dept))  # execute() renvoie le curseur en psycopg3
        row = cur.fetchone()
        # On range le résultat dans un dict par nom de colonne pour s'y retrouver.
        cols = [desc.name for desc in cur.description]
        d = dict(zip(cols, row))

    total = d["total"]
    portee = f"département {dept}" if dept else "toute la base"
    print(f"\nSuivi des passes de découverte ciblées — {total} assos ({portee})\n")
    print(f"{'plateforme':10} {'avancement':34} {'scannées':>9} {'restantes':>10} {'validées':>9}")
    print("-" * 78)
    for nom, col, marqueur, kind in PLATEFORMES:
        scan = d[f"{nom}_scan"]
        rest = d[f"{nom}_rest"]
        val = d[f"{nom}_val"]
        # % = part du travail de la passe déjà faite (scannées / (scannées + restantes))
        denom = scan + rest
        pct = (scan / denom * 100) if denom else 100.0
        print(f"{nom:10} {barre(pct)}  {scan:9} {rest:10} {val:9}")
    print()


if __name__ == "__main__":
    try:
        import sys
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
    main()
