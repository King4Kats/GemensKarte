import type { CategoryId } from "@gemenskarte/shared";

/**
 * Classe une association dans une catégorie "confetti" à partir de son
 * titre + objet (le RNA ne fournit pas de catégorie exploitable directement).
 *
 * v2 — corrections :
 * - Regex \b (mot entier) pour les termes courts/ambigus ("art", "velo", "don"…)
 * - Sport en premier : termes très spécifiques, évite les faux positifs eco/cult
 * - Handball, volley, badminton, boxe, karaté, chasse, pêche ajoutés au sport
 * - Eco resserré : "nature" → expressions complètes uniquement
 * - Cult : "art" → word-boundary (évite "artisan", "martial", "départ"…)
 * - Soli : "soin" → word-boundary (évite "besoin", "voisin"…)
 */

/** Construit un pattern mot-entier insensible à la casse. */
const w = (term: string): RegExp =>
  new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");

function matchesAny(haystack: string, patterns: Array<string | RegExp>): boolean {
  return patterns.some((p) =>
    typeof p === "string" ? haystack.includes(p) : p.test(haystack),
  );
}

const RULES: Array<{ cat: CategoryId; patterns: Array<string | RegExp> }> = [
  // ── SPORT — termes spécifiques en premier pour éviter les collisions ──────
  {
    cat: "sport",
    patterns: [
      "football", "handball", "volleyball", "volley-ball", "volley ",
      "badminton", "basketball", "basket ",
      "rugby", "tennis", "ping-pong", "tennis de table",
      "natation", "triathlon", "duathlon",
      "athlétisme", "athletisme",
      "gymnastique",
      "judo", "karaté", "karate", "taekwondo", "aïkido", "aikido",
      "kung-fu", "boxe", "lutte sportive", "lutte olympique", "lutte libre", "escrime",
      "cyclisme", "bicyclette", "cyclotourisme", w("vélo"), w("velo"), "vtt", "bmx",
      "randonnée", "randonnee", w("trail"), "marche nordique",
      "escalade", "spéléologie",
      "voile nautique", "club de voile", "nautique", "kayak", "aviron", "canoë", "canoe",
      "surf", "kitesurf", "windsurf",
      "équitation", "equitation", "hippique",
      "golf", "aéroclub", "aéro-club", "vol à moteur", "ulm", "parapente", "deltaplane",
      w("sport"), w("sportif"), w("sportive"),
      w("pétanque"), w("boules"),
      w("yoga"), w("pilates"), w("zumba"),
      "roller ", "patinage",
      "tir sportif", "tir à l'arc",
      // chasse & pêche = loisir sportif en droit français
      w("chasse"), w("chasseur"), w("gibier"), "cynégét",
      w("pêche"), w("pêcheur"), "peche ",
      "motocross", "moto-cross", w("quad"), "enduro",
      "paintball", "fléchettes", "flechettes", "darts",
      // arts martiaux / combat
      "arts martiaux", "art martial",
      "krav maga", "krav-maga",
      "self-defense", "self defense", "self-défense",
      "mma ", "mixed martial",
      // pluriels manquants
      w("sports"), w("sportifs"), w("sportives"),
    ],
  },

  // ── ÉCOLOGIE — resserré sur les vrais termes environnementaux ─────────────
  {
    cat: "eco",
    patterns: [
      "environnement", "écologie", "ecologie", "écologique", "ecologique",
      "transition énergétique", "transition écologique",
      "biodiversité", "biodiversite",
      "développement durable", "developpement durable",
      "énergie renouvelable", "energie renouvelable", "panneaux solaires", "photovoltaïque",
      "compost", "compostage", "permaculture",
      w("déchet"), w("dechet"), "zéro déchet",
      "recyclage", w("recyclerie"),
      "protection de la nature", "milieu naturel", "espaces naturels",
      "faune", "flore", "zones humides", "marais",
      "rivière", "littoral", "océan", "golfe",
      w("abeille"), w("abeilles"), "apiculture", "apiculteur",
      "jardin partagé", "jardinage collectif", "jardins familiaux",
      "agriculture biologique", "maraîchage", "maraichage",
      "mobilité douce", "covoiturage",
      w("climat"),
    ],
  },

  // ── CULTURE / ARTS ────────────────────────────────────────────────────────
  {
    cat: "cult",
    patterns: [
      w("culture"), "culturel", "culturelle",
      "théâtre", "theatre", "théâtral",
      "musique", "musical", "musicale",
      "danse", "chorégraph",
      w("arts"), "arts plastiques", "arts visuels", "beaux-arts",
      "peinture", "dessin", "sculpture", "céramique", "poterie",
      "photo ", "photographie",
      "cinéma", "cinema", "film ", "audiovisuel",
      "lecture", "livre ", "littérature", "poésie", "poesie", "conte ",
      "chant ", "chorale", "choeur", "harmonie ", "fanfare", "orchestre",
      "concert", "festival",
      "spectacle", "cirque", "magie ",
      "musée", "musee", "exposition",
      "artisanat",
      "folklore", "folklorique",
    ],
  },

  // ── ÉDUCATION / JEUNESSE ─────────────────────────────────────────────────
  {
    cat: "edu",
    patterns: [
      w("jeunesse"),
      w("scolaire"), "périscolaire", "periscolaire",
      "école ", "ecole ", "maison familiale rurale",
      "éducation", "education", "pédagogie", "pedagogie",
      w("enfant"), "enfance",
      "devoirs", "soutien scolaire",
      "formation ", "apprentissage",
      w("numérique"), w("informatique"),
      "scout", "scoutisme",
    ],
  },

  // ── SOLIDARITÉ / SANTÉ ───────────────────────────────────────────────────
  {
    cat: "soli",
    patterns: [
      "solidarité", "solidarite", w("solidaire"),
      "humanitaire", "caritatif", "caritative",
      "insertion ", "réinsertion", "reinsertion",
      "précarité", "precarite", "exclusion sociale",
      "migrant", "réfugié", "refugie",
      "réemploi", "reemploi", "anti-gaspi", "épicerie solidaire",
      w("secours"),
      "santé", "sante", "médical", "medical", "paraméd",
      "handicap", "autisme", "trisomie", "sida", "vih", "sclérose",
      w("soin"), "soins ", "thérapie", "therapie",
      "aidant", "dépendance", "dependance",
      "alimentaire", "banque alimentaire",
    ],
  },
  // ── PATRIMOINE ───────────────────────────────────────────────────────────
  {
    cat: "patri" as CategoryId,
    patterns: [
      "patrimoine", "patrimonial",
      "société d'histoire", "société historique", "histoire locale",
      "archéologie", "archéologique", "fouille",
      "généalogie", "généalogique",
      "monument historique", "monument aux morts",
      "restauration du patrimoine", "sauvegarde du patrimoine",
      "mémoire locale", "mémoire collective",
      "moulin à vent", "moulin à eau", "lavoir",
      "abbaye", "prieuré", "chapelle", "dolmen", "menhir",
    ],
  },
];

export function classify(title: string, objet: string): CategoryId {
  const haystack = `${title} ${objet}`.toLowerCase();
  for (const rule of RULES) {
    if (matchesAny(haystack, rule.patterns)) return rule.cat;
  }
  return "social"; // Loisirs, amicales, comités de fêtes, divers…
}
