// Petits outils pour situer une association : à partir d'un code postal on retrouve
// le département, et à partir du département on retrouve la région. Couvre désormais
// TOUTE la France (métropole + Corse + DROM-COM), pour l'import du RNA national.

/**
 * Table de correspondance : code département → nom de région.
 * Métropole (18 régions), Corse (2A/2B) et Outre-mer (chaque DROM = sa propre région ;
 * les COM regroupées sous « Outre-mer »).
 */
const DEPT_TO_REGION: Record<string, string> = {
  // Auvergne-Rhône-Alpes
  "01": "Auvergne-Rhône-Alpes", "03": "Auvergne-Rhône-Alpes", "07": "Auvergne-Rhône-Alpes",
  "15": "Auvergne-Rhône-Alpes", "26": "Auvergne-Rhône-Alpes", "38": "Auvergne-Rhône-Alpes",
  "42": "Auvergne-Rhône-Alpes", "43": "Auvergne-Rhône-Alpes", "63": "Auvergne-Rhône-Alpes",
  "69": "Auvergne-Rhône-Alpes", "73": "Auvergne-Rhône-Alpes", "74": "Auvergne-Rhône-Alpes",
  // Bourgogne-Franche-Comté
  "21": "Bourgogne-Franche-Comté", "25": "Bourgogne-Franche-Comté", "39": "Bourgogne-Franche-Comté",
  "58": "Bourgogne-Franche-Comté", "70": "Bourgogne-Franche-Comté", "71": "Bourgogne-Franche-Comté",
  "89": "Bourgogne-Franche-Comté", "90": "Bourgogne-Franche-Comté",
  // Bretagne
  "22": "Bretagne", "29": "Bretagne", "35": "Bretagne", "56": "Bretagne",
  // Centre-Val de Loire
  "18": "Centre-Val de Loire", "28": "Centre-Val de Loire", "36": "Centre-Val de Loire",
  "37": "Centre-Val de Loire", "41": "Centre-Val de Loire", "45": "Centre-Val de Loire",
  // Corse
  "2A": "Corse", "2B": "Corse",
  // Grand Est
  "08": "Grand Est", "10": "Grand Est", "51": "Grand Est", "52": "Grand Est", "54": "Grand Est",
  "55": "Grand Est", "57": "Grand Est", "67": "Grand Est", "68": "Grand Est", "88": "Grand Est",
  // Hauts-de-France
  "02": "Hauts-de-France", "59": "Hauts-de-France", "60": "Hauts-de-France",
  "62": "Hauts-de-France", "80": "Hauts-de-France",
  // Île-de-France
  "75": "Île-de-France", "77": "Île-de-France", "78": "Île-de-France", "91": "Île-de-France",
  "92": "Île-de-France", "93": "Île-de-France", "94": "Île-de-France", "95": "Île-de-France",
  // Normandie
  "14": "Normandie", "27": "Normandie", "50": "Normandie", "61": "Normandie", "76": "Normandie",
  // Nouvelle-Aquitaine
  "16": "Nouvelle-Aquitaine", "17": "Nouvelle-Aquitaine", "19": "Nouvelle-Aquitaine",
  "23": "Nouvelle-Aquitaine", "24": "Nouvelle-Aquitaine", "33": "Nouvelle-Aquitaine",
  "40": "Nouvelle-Aquitaine", "47": "Nouvelle-Aquitaine", "64": "Nouvelle-Aquitaine",
  "79": "Nouvelle-Aquitaine", "86": "Nouvelle-Aquitaine", "87": "Nouvelle-Aquitaine",
  // Occitanie
  "09": "Occitanie", "11": "Occitanie", "12": "Occitanie", "30": "Occitanie", "31": "Occitanie",
  "32": "Occitanie", "34": "Occitanie", "46": "Occitanie", "48": "Occitanie", "65": "Occitanie",
  "66": "Occitanie", "81": "Occitanie", "82": "Occitanie",
  // Pays de la Loire
  "44": "Pays de la Loire", "49": "Pays de la Loire", "53": "Pays de la Loire",
  "72": "Pays de la Loire", "85": "Pays de la Loire",
  // Provence-Alpes-Côte d'Azur
  "04": "Provence-Alpes-Côte d'Azur", "05": "Provence-Alpes-Côte d'Azur",
  "06": "Provence-Alpes-Côte d'Azur", "13": "Provence-Alpes-Côte d'Azur",
  "83": "Provence-Alpes-Côte d'Azur", "84": "Provence-Alpes-Côte d'Azur",
  // DROM (chacun = sa propre région)
  "971": "Guadeloupe", "972": "Martinique", "973": "Guyane", "974": "La Réunion", "976": "Mayotte",
  // COM / autres (regroupées)
  "975": "Outre-mer", "977": "Outre-mer", "978": "Outre-mer", "984": "Outre-mer",
  "986": "Outre-mer", "987": "Outre-mer", "988": "Outre-mer",
};

/** Renvoie le nom de région d'un département, ou null si inconnu. */
export function regionFromDepartment(dept: string | null | undefined): string | null {
  if (!dept) return null;
  return DEPT_TO_REGION[dept] ?? null;
}

/** Déduit le code département à partir d'un code postal à 5 chiffres (Corse + DROM gérés). */
export function departmentFromPostalCode(postalCode: string | null | undefined): string | null {
  if (!postalCode) return null;
  const code = postalCode.trim();
  if (!/^\d{5}$/.test(code)) return null;
  const p2 = code.slice(0, 2);
  // Outre-mer : département sur 3 chiffres (971xx → 971, 988xx → 988…).
  if (p2 === "97" || p2 === "98") return code.slice(0, 3);
  // Corse : 2A (Corse-du-Sud) / 2B (Haute-Corse). Heuristique sur le code postal.
  if (p2 === "20") return Number(code) < 20200 ? "2A" : "2B";
  return p2;
}

/** Vrai si le département est connu (toute la France désormais). */
export function isCovered(dept: string | null | undefined): boolean {
  return !!dept && dept in DEPT_TO_REGION;
}
