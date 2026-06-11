// Départements couverts par les pages SEO (code INSEE -> nom + slug d'URL + forme
// grammaticale "de" correcte). Vendée (en cours d'enrichissement) + Occitanie sans
// l'Hérault (RNA seul pour l'instant).
// `de` = la bonne tournure française ("de la Vendée", "du Lot", "de l'Ariège",
// "des Hautes-Pyrénées") -> évite les fautes type "du Vendée".
export const SEO_DEPARTEMENTS: Record<string, { nom: string; slug: string; de: string; region: string }> = {
  "85": { nom: "Vendée", slug: "vendee", de: "de la Vendée", region: "Pays de la Loire" },
  "09": { nom: "Ariège", slug: "ariege", de: "de l'Ariège", region: "Occitanie" },
  "11": { nom: "Aude", slug: "aude", de: "de l'Aude", region: "Occitanie" },
  "12": { nom: "Aveyron", slug: "aveyron", de: "de l'Aveyron", region: "Occitanie" },
  "30": { nom: "Gard", slug: "gard", de: "du Gard", region: "Occitanie" },
  "31": { nom: "Haute-Garonne", slug: "haute-garonne", de: "de la Haute-Garonne", region: "Occitanie" },
  "32": { nom: "Gers", slug: "gers", de: "du Gers", region: "Occitanie" },
  "46": { nom: "Lot", slug: "lot", de: "du Lot", region: "Occitanie" },
  "48": { nom: "Lozère", slug: "lozere", de: "de la Lozère", region: "Occitanie" },
  "65": { nom: "Hautes-Pyrénées", slug: "hautes-pyrenees", de: "des Hautes-Pyrénées", region: "Occitanie" },
  "66": { nom: "Pyrénées-Orientales", slug: "pyrenees-orientales", de: "des Pyrénées-Orientales", region: "Occitanie" },
  "81": { nom: "Tarn", slug: "tarn", de: "du Tarn", region: "Occitanie" },
  "82": { nom: "Tarn-et-Garonne", slug: "tarn-et-garonne", de: "du Tarn-et-Garonne", region: "Occitanie" },
};

export const SEO_DEPT_CODES = Object.keys(SEO_DEPARTEMENTS);
export const SEO_DEPT_SLUGS = Object.values(SEO_DEPARTEMENTS).map((d) => d.slug);
// slug d'URL -> code INSEE (ex. "haute-garonne" -> "31").
export const SEO_CODE_BY_SLUG: Record<string, string> = Object.fromEntries(
  Object.entries(SEO_DEPARTEMENTS).map(([code, d]) => [d.slug, code]),
);
