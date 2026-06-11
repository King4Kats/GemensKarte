// Territoires couverts par GemensKarte + leur ÉTAT de scrap (pour le code couleur
// de la carte de France). Périmètre actuel : Vendée (en cours) + Occitanie sans
// l'Hérault (non scrapées, infos RNA seules pour l'instant). Les tracés SVG vivent
// dans `fr-departements-paths.ts`.

// État du scrap d'un territoire -> détermine sa couleur sur la carte.
export type ScrapState = "fait" | "en_cours" | "non_scrape";

export interface DeptMeta {
  code: string;
  nom: string;
  slug: string;     // sous-domaine futur : <slug>.gemenskarte.fr
  region: string;
  state: ScrapState;
}

/** Départements servis, indexés par code INSEE, avec leur état de scrap. */
export const COVERED: Record<string, DeptMeta> = {
  // Vendée : scrap EN COURS (rose)
  "85": { code: "85", nom: "Vendée", slug: "vendee", region: "Pays de la Loire", state: "en_cours" },
  // Occitanie (sans l'Hérault 34) : NON SCRAPÉES (bleu) — infos RNA seules
  "09": { code: "09", nom: "Ariège",              slug: "ariege",              region: "Occitanie", state: "non_scrape" },
  "11": { code: "11", nom: "Aude",                slug: "aude",                region: "Occitanie", state: "non_scrape" },
  "12": { code: "12", nom: "Aveyron",             slug: "aveyron",             region: "Occitanie", state: "non_scrape" },
  "30": { code: "30", nom: "Gard",                slug: "gard",                region: "Occitanie", state: "non_scrape" },
  "31": { code: "31", nom: "Haute-Garonne",       slug: "haute-garonne",       region: "Occitanie", state: "non_scrape" },
  "32": { code: "32", nom: "Gers",                slug: "gers",                region: "Occitanie", state: "non_scrape" },
  "46": { code: "46", nom: "Lot",                 slug: "lot",                 region: "Occitanie", state: "non_scrape" },
  "48": { code: "48", nom: "Lozère",              slug: "lozere",              region: "Occitanie", state: "non_scrape" },
  "65": { code: "65", nom: "Hautes-Pyrénées",     slug: "hautes-pyrenees",     region: "Occitanie", state: "non_scrape" },
  "66": { code: "66", nom: "Pyrénées-Orientales", slug: "pyrenees-orientales", region: "Occitanie", state: "non_scrape" },
  "81": { code: "81", nom: "Tarn",                slug: "tarn",                region: "Occitanie", state: "non_scrape" },
  "82": { code: "82", nom: "Tarn-et-Garonne",     slug: "tarn-et-garonne",     region: "Occitanie", state: "non_scrape" },
};

/** Code couleur de la carte, par état de scrap. */
export const STATE_COLOR: Record<ScrapState, string> = {
  fait: "#00b87a",        // vert — scrap effectué
  en_cours: "#ff2d78",    // rose — scrap en cours
  non_scrape: "#2b59ff",  // bleu — non scrapé (RNA seul)
};
export const STATE_LABEL: Record<ScrapState, string> = {
  fait: "Scrap effectué",
  en_cours: "En cours de scrap",
  non_scrape: "Non scrapé · infos RNA",
};
/** Ordre d'affichage de la légende. */
export const STATE_ORDER: ScrapState[] = ["en_cours", "non_scrape", "fait"];

/** Couleur d'accent par région (utilisée par la pastille confettis de l'accueil). */
export const REGION_COLOR: Record<string, string> = {
  "Pays de la Loire": "#ff2d78", // magenta (Vendée)
  "Occitanie": "#2b59ff",        // bleu
};

export const COVERED_CODES = Object.keys(COVERED);

export function isCovered(code: string): boolean {
  return code in COVERED;
}

/** Couleur d'un département selon son état (null s'il n'est pas couvert). */
export function colorOf(code: string): string | null {
  const m = COVERED[code];
  return m ? STATE_COLOR[m.state] : null;
}
