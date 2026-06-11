// Départements couverts par les pages SEO (code INSEE -> nom + slug d'URL).
// Vendée (en cours d'enrichissement) + Occitanie sans l'Hérault (RNA seul pour l'instant).
// Utilisé par le service SEO ET par main.ts (pour exclure ces routes du préfixe /api).
export const SEO_DEPARTEMENTS: Record<string, { nom: string; slug: string; region: string }> = {
  "85": { nom: "Vendée", slug: "vendee", region: "Pays de la Loire" },
  "09": { nom: "Ariège", slug: "ariege", region: "Occitanie" },
  "11": { nom: "Aude", slug: "aude", region: "Occitanie" },
  "12": { nom: "Aveyron", slug: "aveyron", region: "Occitanie" },
  "30": { nom: "Gard", slug: "gard", region: "Occitanie" },
  "31": { nom: "Haute-Garonne", slug: "haute-garonne", region: "Occitanie" },
  "32": { nom: "Gers", slug: "gers", region: "Occitanie" },
  "46": { nom: "Lot", slug: "lot", region: "Occitanie" },
  "48": { nom: "Lozère", slug: "lozere", region: "Occitanie" },
  "65": { nom: "Hautes-Pyrénées", slug: "hautes-pyrenees", region: "Occitanie" },
  "66": { nom: "Pyrénées-Orientales", slug: "pyrenees-orientales", region: "Occitanie" },
  "81": { nom: "Tarn", slug: "tarn", region: "Occitanie" },
  "82": { nom: "Tarn-et-Garonne", slug: "tarn-et-garonne", region: "Occitanie" },
};

export const SEO_DEPT_CODES = Object.keys(SEO_DEPARTEMENTS);
export const SEO_DEPT_SLUGS = Object.values(SEO_DEPARTEMENTS).map((d) => d.slug);
// slug d'URL -> code INSEE (ex. "haute-garonne" -> "31").
export const SEO_CODE_BY_SLUG: Record<string, string> = Object.fromEntries(
  Object.entries(SEO_DEPARTEMENTS).map(([code, d]) => [d.slug, code]),
);
