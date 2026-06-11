// Petits outils pour situer une association : à partir d'un code postal on retrouve
// le département, et à partir du département on retrouve la région. Sert aussi à vérifier
// qu'une association est bien dans la zone géographique couverte par GemensKarte (l'Ouest).

/**
 * Table de correspondance : numéro de département (ex: "44") → nom de région.
 * Seuls les départements de l'Ouest gérés par l'app sont listés ici.
 */
const DEPT_TO_REGION: Record<string, string> = {
  // Bretagne
  "22": "Bretagne", "29": "Bretagne", "35": "Bretagne", "56": "Bretagne",
  // Pays de la Loire
  "44": "Pays de la Loire", "49": "Pays de la Loire", "53": "Pays de la Loire",
  "72": "Pays de la Loire", "85": "Pays de la Loire",
  // Normandie
  "14": "Normandie", "27": "Normandie", "50": "Normandie",
  "61": "Normandie", "76": "Normandie",
  // Occitanie (sans l'Hérault 34)
  "09": "Occitanie", "11": "Occitanie", "12": "Occitanie", "30": "Occitanie",
  "31": "Occitanie", "32": "Occitanie", "46": "Occitanie", "48": "Occitanie",
  "65": "Occitanie", "66": "Occitanie", "81": "Occitanie", "82": "Occitanie",
};

/** Renvoie le nom de région d'un département, ou null si on ne le couvre pas. */
export function regionFromDepartment(dept: string | null | undefined): string | null {
  if (!dept) return null;
  return DEPT_TO_REGION[dept] ?? null;
}

/** Déduit le département (2 premiers chiffres) à partir d'un code postal à 5 chiffres. */
export function departmentFromPostalCode(postalCode: string | null | undefined): string | null {
  if (!postalCode) return null;
  const code = postalCode.trim();
  // On vérifie que le code postal est bien composé de 5 chiffres avant de le découper.
  if (!/^\d{5}$/.test(code)) return null;
  // Corse (2A/2B) non couverte ici, on reste sur 2 chiffres.
  return code.slice(0, 2);
}

/** Vrai si le département appartient au périmètre couvert. */
export function isCovered(dept: string | null | undefined): boolean {
  return !!dept && dept in DEPT_TO_REGION;
}
