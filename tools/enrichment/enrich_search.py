"""Passe B (spike) — pour un échantillon d'associations, cherche sur le web
le site officiel + les réseaux sociaux via ScrapeGraphAI (SearchGraph) + Ollama local.

Usage:
  python enrich_search.py [--limit N] [--offset N] [--in sample.json] [--out results.json]

Pré-requis: Ollama lancé (http://localhost:11434) avec mistral:7b + nomic-embed-text,
et `playwright install chromium`.
"""

import argparse
import json
import sys
import time
from pathlib import Path

from scrapegraphai.graphs import SearchGraph

HERE = Path(__file__).parent

GRAPH_CONFIG = {
    "llm": {
        "model": "ollama/mistral:7b",
        "base_url": "http://localhost:11434",
        "temperature": 0,
        "format": "json",
        "model_tokens": 8192,
    },
    "embeddings": {
        "model": "ollama/nomic-embed-text",
        "base_url": "http://localhost:11434",
    },
    "max_results": 3,          # nb de pages scrappées par recherche
    "verbose": False,
    "headless": True,
}

# Schéma de sortie attendu pour chaque asso.
EXTRACT_PROMPT = (
    "Tu cherches le site web officiel et les réseaux sociaux d'une association "
    "française. Renvoie un JSON avec les clés: website (url du site officiel ou null), "
    "facebook (url ou null), instagram (url ou null), twitter (url ou null), "
    "linkedin (url ou null), confidence (entre 0 et 1: à quel point tu es sûr que "
    "ces liens correspondent vraiment à CETTE association et pas à une autre). "
    "Si tu ne trouves rien de fiable, mets les champs à null et confidence à 0."
)


def enrich_one(asso: dict) -> dict:
    name = asso["name"]
    city = asso.get("city") or ""
    query = f'association "{name}" {city} site officiel facebook instagram'

    started = time.time()
    result = {"links": None, "error": None}
    try:
        graph = SearchGraph(
            prompt=f"{EXTRACT_PROMPT}\nAssociation recherchée: « {name} » à {city}.",
            config={**GRAPH_CONFIG, "search_query": query},
        )
        answer = graph.run()
        result["links"] = answer
    except Exception as exc:  # spike: on capture pour ne pas perdre le batch
        result["error"] = f"{type(exc).__name__}: {exc}"
    result["elapsed_s"] = round(time.time() - started, 1)
    return result


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=10)
    ap.add_argument("--offset", type=int, default=0)
    ap.add_argument("--in", dest="infile", default=str(HERE / "sample.json"))
    ap.add_argument("--out", dest="outfile", default=str(HERE / "results.json"))
    args = ap.parse_args()

    assos = json.loads(Path(args.infile).read_text(encoding="utf-8"))
    batch = assos[args.offset : args.offset + args.limit]
    print(f"Enrichissement de {len(batch)} associations (sur {len(assos)})...", flush=True)

    out = []
    for i, asso in enumerate(batch, 1):
        print(f"  [{i}/{len(batch)}] {asso['name']} ({asso.get('city')})", flush=True)
        enriched = enrich_one(asso)
        print(
            f"      -> {enriched['elapsed_s']}s "
            f"{'ERR ' + enriched['error'] if enriched['error'] else enriched['links']}",
            flush=True,
        )
        out.append({**asso, **enriched})
        # écriture incrémentale pour ne rien perdre si Ollama plante
        Path(args.outfile).write_text(
            json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8"
        )

    ok = sum(1 for r in out if r["error"] is None and r["links"])
    print(f"\nTerminé: {ok}/{len(out)} réponses sans erreur. Résultats -> {args.outfile}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
