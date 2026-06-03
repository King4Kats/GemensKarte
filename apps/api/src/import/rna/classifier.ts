import type { CategoryId } from "@gemenskarte/shared";

/**
 * Classe une association dans une catégorie "confetti" à partir de son
 * titre + objet (le RNA ne fournit pas de catégorie exploitable directement).
 * Approche par mots-clés, ordre = priorité. Repli : "social".
 */
const RULES: Array<{ cat: CategoryId; words: string[] }> = [
  { cat: "eco", words: ["environnement", "écologie", "ecologie", "nature", "jardin", "climat",
    "biodiversité", "vélo", "velo", "mobilité", "déchet", "compost", "permaculture", "transition",
    "littoral", "rivière", "faune", "flore"] },
  { cat: "cult", words: ["culture", "théâtre", "theatre", "musique", "art", "danse", "cinéma",
    "patrimoine", "lecture", "chant", "chorale", "festival", "spectacle", "peinture", "photo",
    "musée", "concert", "danse"] },
  { cat: "sport", words: ["sport", "football", "rugby", "tennis", "gymnastique", "judo", "basket",
    "natation", "randonnée", "rando", "cyclisme", "course", "roller", "escalade", "yoga",
    "voile", "nautique", "athlétisme", "pétanque"] },
  { cat: "edu", words: ["jeunesse", "scolaire", "étudiant", "etudiant", "école", "ecole",
    "éducation", "education", "enfance", "périscolaire", "devoirs", "formation", "apprentissage",
    "numérique", "code", "savoir"] },
  { cat: "soli", words: ["solidarité", "solidarite", "humanitaire", "caritative", "insertion",
    "précarité", "precarite", "migrant", "réemploi", "recyclerie", "anti-gaspi", "épicerie solidaire",
    "secours", "don", "santé", "sante", "handicap", "soin", "aidant", "alimentaire"] },
  { cat: "social", words: ["social", "entraide", "quartier", "famille", "senior", "lien social",
    "café associatif", "voisin", "intergénérationnel", "accueil", "loisir", "amicale", "comité"] },
];

export function classify(title: string, objet: string): CategoryId {
  const haystack = `${title} ${objet}`.toLowerCase();
  for (const rule of RULES) {
    if (rule.words.some((w) => haystack.includes(w))) return rule.cat;
  }
  return "social";
}
