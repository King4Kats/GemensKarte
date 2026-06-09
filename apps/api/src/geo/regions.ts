/** Départements → régions couvertes par GemensKarte. */
const DEPT_TO_REGION: Record<string, string> = {
  // Bretagne
  "22": "Bretagne", "29": "Bretagne", "35": "Bretagne", "56": "Bretagne",
  // Pays de la Loire
  "44": "Pays de la Loire", "49": "Pays de la Loire", "53": "Pays de la Loire",
  "72": "Pays de la Loire", "85": "Pays de la Loire",
  // Normandie
  "14": "Normandie", "27": "Normandie", "50": "Normandie",
  "61": "Normandie", "76": "Normandie",
};

export function regionFromDepartment(dept: string | null | undefined): string | null {
  if (!dept) return null;
  return DEPT_TO_REGION[dept] ?? null;
}

export function departmentFromPostalCode(postalCode: string | null | undefined): string | null {
  if (!postalCode) return null;
  const code = postalCode.trim();
  if (!/^\d{5}$/.test(code)) return null;
  // Corse (2A/2B) non couverte ici, on reste sur 2 chiffres.
  return code.slice(0, 2);
}

/** Vrai si le département appartient au périmètre couvert. */
export function isCovered(dept: string | null | undefined): boolean {
  return !!dept && dept in DEPT_TO_REGION;
}
