import type { CategoryId } from "@gemenskarte/shared";

/**
 * Classe une association dans une catégorie "confetti" à partir de son
 * titre + objet (le RNA ne fournit pas de catégorie exploitable directement).
 * Approche par mots-clés, ordre = priorité. Repli : "social".
 */
const RULES: Array<{ cat: CategoryId; words: string[] }> = [
  { cat: "eco", words: ["environnement", "écologie", "ecologie", "nature", "jardin", "climat",
    "biodiversité", "vélo", "velo", "mobilité", "déchet", "compost", "permaculture", "transition"] },
  { cat: "culture", words: ["culture", "théâtre", "theatre", "musique", "art", "danse", "cinéma",
    "patrimoine", "lecture", "chant", "chorale", "festival", "spectacle", "peinture", "photo"] },
  { cat: "sport", words: ["sport", "football", "rugby", "tennis", "gymnastique", "judo", "basket",
    "natation", "randonnée", "rando", "cyclisme", "course", "roller", "escalade", "yoga"] },
  { cat: "jeunesse", words: ["jeunesse", "scolaire", "étudiant", "etudiant", "école", "ecole",
    "éducation", "education", "enfance", "périscolaire", "devoirs", "formation", "apprentissage"] },
  { cat: "sante", words: ["santé", "sante", "bien-être", "bien etre", "handicap", "médical",
    "soin", "maladie", "secours", "sophrologie", "prévention", "aidant"] },
  { cat: "social", words: ["solidarité", "solidarite", "social", "entraide", "humanitaire",
    "caritative", "insertion", "précarité", "migrant", "quartier", "famille", "senior"] },
];

export function classify(title: string, objet: string): CategoryId {
  const haystack = `${title} ${objet}`.toLowerCase();
  for (const rule of RULES) {
    if (rule.words.some((w) => haystack.includes(w))) return rule.cat;
  }
  return "social";
}
