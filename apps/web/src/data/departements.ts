// Infos (nom, slug, région...) des départements couverts par GemensKarte
// (périmètre actuel : Bretagne + Pays de la Loire + Normandie). Les tracés SVG
// de la carte vivent ailleurs, dans `fr-departements-paths.ts` ; ce fichier-ci
// décrit seulement les 14 territoires actifs et fournit des petites fonctions
// utilitaires (est-il couvert ? est-il déjà en ligne ?).

export interface DeptMeta {
  code: string;
  nom: string;
  slug: string;     // sous-domaine futur : <slug>.gemenskarte.fr
  region: string;
}

/** Les 14 départements actuellement servis, indexés par code INSEE. */
export const COVERED: Record<string, DeptMeta> = {
  // Bretagne
  "22": { code: "22", nom: "Côtes-d'Armor",    slug: "cotes-darmor",     region: "Bretagne" },
  "29": { code: "29", nom: "Finistère",        slug: "finistere",        region: "Bretagne" },
  "35": { code: "35", nom: "Ille-et-Vilaine",  slug: "ille-et-vilaine",  region: "Bretagne" },
  "56": { code: "56", nom: "Morbihan",         slug: "morbihan",         region: "Bretagne" },
  // Pays de la Loire
  "44": { code: "44", nom: "Loire-Atlantique", slug: "loire-atlantique", region: "Pays de la Loire" },
  "49": { code: "49", nom: "Maine-et-Loire",   slug: "maine-et-loire",   region: "Pays de la Loire" },
  "53": { code: "53", nom: "Mayenne",          slug: "mayenne",          region: "Pays de la Loire" },
  "72": { code: "72", nom: "Sarthe",           slug: "sarthe",           region: "Pays de la Loire" },
  "85": { code: "85", nom: "Vendée",           slug: "vendee",           region: "Pays de la Loire" },
  // Normandie
  "14": { code: "14", nom: "Calvados",         slug: "calvados",         region: "Normandie" },
  "27": { code: "27", nom: "Eure",             slug: "eure",             region: "Normandie" },
  "50": { code: "50", nom: "Manche",           slug: "manche",           region: "Normandie" },
  "61": { code: "61", nom: "Orne",             slug: "orne",             region: "Normandie" },
  "76": { code: "76", nom: "Seine-Maritime",   slug: "seine-maritime",   region: "Normandie" },
};

/** Couleur d'accent par région (charte peps). */
export const REGION_COLOR: Record<string, string> = {
  "Bretagne": "#2b59ff",         // bleu électrique
  "Pays de la Loire": "#ff2d78", // magenta (région phare, Vendée)
  "Normandie": "#7b3ff2",        // violet
};

export const COVERED_CODES = Object.keys(COVERED);
export const REGIONS = ["Bretagne", "Pays de la Loire", "Normandie"] as const;

export function isCovered(code: string): boolean {
  return code in COVERED;
}

/**
 * Territoires réellement EN LIGNE : seuls ceux-ci sont colorés et cliquables sur
 * le portail. Le reste de la carte est laissé en blanc. On ajoute un code ici
 * quand le département a ses données prêtes (« on colore quand on a les données »).
 */
export const READY_CODES = ["85"]; // Vendée

export function isReady(code: string): boolean {
  return READY_CODES.includes(code);
}
