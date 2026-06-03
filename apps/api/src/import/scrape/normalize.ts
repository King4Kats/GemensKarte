/** Normalisation de noms d'associations + similarité (pour l'appariement RNA). */

const STOP = new Set([
  "association", "asso", "amicale", "club", "comite", "comité", "les", "le", "la",
  "des", "de", "du", "d", "l", "et", "pour", "aux", "au", "en", "the", "of",
]);

/** minuscule, sans accents, sans ponctuation, sans mots vides. */
export function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((w) => w.length > 1 && !STOP.has(w))
    .join(" ")
    .trim();
}

function trigrams(s: string): Set<string> {
  const t = `  ${s} `;
  const set = new Set<string>();
  for (let i = 0; i < t.length - 2; i++) set.add(t.slice(i, i + 3));
  return set;
}

/** Coefficient de Dice sur trigrammes des chaînes normalisées (0..1). */
export function similarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const ta = trigrams(na);
  const tb = trigrams(nb);
  let inter = 0;
  for (const g of ta) if (tb.has(g)) inter++;
  return (2 * inter) / (ta.size + tb.size);
}
