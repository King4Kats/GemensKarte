/**
 * Outils pour comparer des noms d'associations entre eux.
 * Deux fichiers différents écrivent rarement un nom à l'identique
 * ("Asso. des Amis du Parc" vs "amis du parc"). Ce fichier sert à
 * "nettoyer" les noms puis à mesurer à quel point deux noms se ressemblent,
 * afin de retrouver qu'il s'agit de la même association (appariement RNA).
 */

// Mots trop courants pour aider à distinguer une association d'une autre :
// on les retire avant comparaison (on appelle ça des "mots vides" / stop words).
const STOP = new Set([
  "association", "asso", "amicale", "club", "comite", "comité", "les", "le", "la",
  "des", "de", "du", "d", "l", "et", "pour", "aux", "au", "en", "the", "of",
]);

/**
 * Met un nom sous une forme "standard" pour pouvoir le comparer.
 * Résultat : tout en minuscules, sans accents, sans ponctuation et sans mots vides.
 * Exemple : "Association des Amis du Parc !" -> "amis parc".
 */
export function normalize(s: string): string {
  return s
    .normalize("NFD")              // sépare la lettre et son accent (é -> e + ´)
    .replace(/[̀-ͯ]/g, "")  // supprime les accents maintenant détachés
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")   // tout ce qui n'est pas lettre/chiffre devient un espace
    .split(" ")
    .filter((w) => w.length > 1 && !STOP.has(w)) // on jette lettres seules et mots vides
    .join(" ")
    .trim();
}

/**
 * Découpe une chaîne en "trigrammes" : tous ses groupes de 3 caractères qui se suivent.
 * On ajoute des espaces autour pour marquer le début/fin de mot.
 * "parc" -> "  p", " pa", "par", "arc", "rc ". Sert ensuite à mesurer la ressemblance.
 */
function trigrams(s: string): Set<string> {
  const t = `  ${s} `;
  const set = new Set<string>();
  for (let i = 0; i < t.length - 2; i++) set.add(t.slice(i, i + 3));
  return set;
}

/**
 * Donne un score de ressemblance entre deux noms, de 0 (rien en commun) à 1 (identiques).
 * Méthode : on normalise les deux noms, on les découpe en trigrammes,
 * puis on regarde la part de trigrammes communs (coefficient de Dice).
 */
export function similarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0; // un nom devenu vide après nettoyage : pas comparable
  if (na === nb) return 1;  // exactement pareils : inutile de calculer
  const ta = trigrams(na);
  const tb = trigrams(nb);
  // On compte combien de trigrammes sont présents dans les deux ensembles.
  let inter = 0;
  for (const g of ta) if (tb.has(g)) inter++;
  // Formule de Dice : 2 x (communs) / (total des deux), donne un résultat entre 0 et 1.
  return (2 * inter) / (ta.size + tb.size);
}
