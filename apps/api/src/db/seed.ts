import { Pool } from "pg";
import { getEnv } from "../config/env";
import { regionFromDepartment } from "../geo/regions";

/**
 * Données de démonstration = les 12 associations de la maquette (Claude Design),
 * réparties sur le Grand Ouest, avec champs riches (membres, année, besoin, CTA).
 * Permet d'avoir une carte vivante sans géocodage.
 */
interface Demo {
  slug: string; name: string; cat: string; city: string; dept: string;
  lat: number; lng: number; blurb: string; description: string;
  founded: number; members: number; email: string; phone: string; website: string;
  insta: string; fb: string; tags: string[]; action: string; needs: string;
}

const DEMO: Demo[] = [
  { slug: "marais-vivant", name: "Marais Vivant", cat: "eco", city: "Rennes", dept: "35",
    lat: 48.1119, lng: -1.6742,
    blurb: "Chantiers nature, refuges urbains et sorties botaniques au fil des saisons.",
    description: "Marais Vivant restaure et anime les zones humides du bassin rennais. On y plante des haies, on recense les amphibiens et on apprend à reconnaître la flore locale — le tout dans une ambiance bénévole bon enfant.",
    founded: 2016, members: 240, email: "bonjour@maraisvivant.bzh", phone: "02 99 00 14 22",
    website: "maraisvivant.bzh", insta: "@marais.vivant", fb: "MaraisVivantRennes",
    tags: ["Biodiversité", "Chantiers", "Sorties nature"], action: "Rejoindre un chantier", needs: "Bénévoles le samedi" },
  { slug: "atelier-confettis", name: "Atelier Confettis", cat: "cult", city: "Nantes", dept: "44",
    lat: 47.2138, lng: -1.5564,
    blurb: "Sérigraphie, fanzines et soirées d'arts imprimés ouvertes à tous.",
    description: "Un atelier partagé dédié aux arts imprimés : sérigraphie, risographie, gravure. Ateliers d'initiation chaque semaine, résidences d'artistes et marché des créateurs deux fois par an.",
    founded: 2019, members: 130, email: "hello@atelierconfettis.fr", phone: "02 40 11 87 03",
    website: "atelierconfettis.fr", insta: "@atelier.confettis", fb: "AtelierConfettis",
    tags: ["Sérigraphie", "Fanzine", "Ateliers"], action: "Réserver un atelier", needs: "Adhésions ouvertes" },
  { slug: "elan-ouest", name: "Élan de l'Ouest", cat: "sport", city: "Brest", dept: "29",
    lat: 48.3886, lng: -4.4869,
    blurb: "Course à pied solidaire et rando côtière, tous niveaux, du lever au coucher.",
    description: "Club omnisport de plein air : trail, marche nordique, randonnée littorale. L'Élan organise chaque mois une sortie « découverte » gratuite pour faire bouger celles et ceux qui n'osent pas pousser la porte d'un club.",
    founded: 2011, members: 410, email: "contact@elanouest.bzh", phone: "02 98 44 70 19",
    website: "elanouest.bzh", insta: "@elan.ouest", fb: "ElanDeLOuest",
    tags: ["Trail", "Marche nordique", "Littoral"], action: "Tester une sortie", needs: "Sortie découverte gratuite" },
  { slug: "le-pont", name: "Le Pont", cat: "social", city: "Caen", dept: "14",
    lat: 49.1829, lng: -0.3707,
    blurb: "Café associatif & accueil de jour pour rompre l'isolement.",
    description: "Le Pont tient un café solidaire à prix libre, propose un accueil de jour, des permanences d'écrivain public et des ateliers numériques pour les personnes en situation de précarité.",
    founded: 2014, members: 95, email: "lepont@assos-caen.fr", phone: "02 31 20 55 41",
    website: "lepont-caen.org", insta: "@lepont.caen", fb: "LePontCaen",
    tags: ["Café solidaire", "Accueil de jour", "Écrivain public"], action: "Devenir bénévole", needs: "Bénévoles accueil" },
  { slug: "graines-partage", name: "Graines de Partage", cat: "soli", city: "Angers", dept: "49",
    lat: 47.4699, lng: -0.5512,
    blurb: "Épicerie solidaire & paniers anti-gaspi pour les étudiants.",
    description: "Graines de Partage récupère les invendus des maraîchers et redistribue des paniers à prix solidaire. L'asso anime aussi des cours de cuisine zéro-déchet et un frigo partagé en centre-ville.",
    founded: 2018, members: 160, email: "contact@grainesdepartage.fr", phone: "02 41 87 33 60",
    website: "grainesdepartage.fr", insta: "@graines.partage", fb: "GrainesDePartage",
    tags: ["Anti-gaspi", "Épicerie solidaire", "Cuisine"], action: "Donner un coup de main", needs: "Collecte le vendredi" },
  { slug: "lire-grandir", name: "Lire & Grandir", cat: "edu", city: "Le Mans", dept: "72",
    lat: 48.0061, lng: 0.1996,
    blurb: "Soutien scolaire et bibliothèque de rue dans les quartiers.",
    description: "Lire & Grandir accompagne les jeunes de 8 à 16 ans : aide aux devoirs, ateliers d'expression, et une bibliothèque de rue qui s'installe sur les places le mercredi après-midi.",
    founded: 2013, members: 78, email: "asso@lire-grandir.org", phone: "02 43 24 09 88",
    website: "lire-grandir.org", insta: "@lire.grandir", fb: "LireEtGrandir",
    tags: ["Soutien scolaire", "Lecture", "Jeunesse"], action: "Parrainer un jeune", needs: "Tuteurs bénévoles" },
  { slug: "voiles-libres", name: "Voiles Libres", cat: "sport", city: "Lorient", dept: "56",
    lat: 47.7486, lng: -3.37,
    blurb: "Voile adaptée et sorties en mer accessibles à tous les corps.",
    description: "Voiles Libres rend la voile accessible aux personnes en situation de handicap grâce à des bateaux adaptés et un équipage formé. Sorties à la journée, stages d'été et régate inclusive en septembre.",
    founded: 2009, members: 205, email: "ohe@voileslibres.bzh", phone: "02 97 21 64 30",
    website: "voileslibres.bzh", insta: "@voiles.libres", fb: "VoilesLibres",
    tags: ["Voile adaptée", "Handicap", "Mer"], action: "Embarquer", needs: "Équipiers bienvenus" },
  { slug: "scene-ouverte", name: "Scène Ouverte", cat: "cult", city: "Rouen", dept: "76",
    lat: 49.4404, lng: 1.0939,
    blurb: "Concerts, impro et scènes ouvertes pour les artistes émergents.",
    description: "Scène Ouverte programme des soirées musique et théâtre d'impro où la scène appartient aux amateurs. L'asso prête du matériel, forme au son et à la lumière, et accompagne les premiers projets.",
    founded: 2017, members: 188, email: "salut@sceneouverte.fr", phone: "02 35 70 12 49",
    website: "sceneouverte.fr", insta: "@scene.ouverte", fb: "SceneOuverteRouen",
    tags: ["Concerts", "Impro", "Émergence"], action: "Proposer une scène", needs: "Régisseurs son/lumière" },
  { slug: "ruche-numerique", name: "La Ruche Numérique", cat: "edu", city: "Vannes", dept: "56",
    lat: 47.6582, lng: -2.7608,
    blurb: "Ateliers code, réparation et inclusion numérique pour seniors.",
    description: "La Ruche démystifie le numérique : initiation au code pour les ados, repair café électronique, et permanences pour aider les seniors avec leurs démarches en ligne.",
    founded: 2020, members: 112, email: "coucou@ruchenum.bzh", phone: "02 97 40 88 21",
    website: "ruchenum.bzh", insta: "@ruche.numerique", fb: "LaRucheNumerique",
    tags: ["Code", "Repair café", "Inclusion"], action: "S'inscrire à un atelier", needs: "Mentors le mardi soir" },
  { slug: "rivieres-claires", name: "Rivières Claires", cat: "eco", city: "Quimper", dept: "29",
    lat: 47.996, lng: -4.0978,
    blurb: "Nettoyage des cours d'eau et sensibilisation à la qualité de l'eau.",
    description: "Rivières Claires veille sur l'Odet et ses affluents : ramassages citoyens, mesures de qualité de l'eau avec les écoles, et plaidoyer auprès des collectivités.",
    founded: 2015, members: 134, email: "contact@rivieresclaires.bzh", phone: "02 98 53 66 14",
    website: "rivieresclaires.bzh", insta: "@rivieres.claires", fb: "RivieresClaires",
    tags: ["Cours d'eau", "Ramassage", "Écoles"], action: "Participer au nettoyage", needs: "Sortie le dimanche" },
  { slug: "voisins-malo", name: "Voisins de Malo", cat: "social", city: "Saint-Malo", dept: "35",
    lat: 48.6493, lng: -2.0257,
    blurb: "Réseau d'entraide entre voisins : courses, visites, coups de main.",
    description: "Voisins de Malo tisse du lien dans les quartiers : un coup de fil pour ne pas rester seul, un voisin pour les courses, des goûters intergénérationnels et un système d'entraide géolocalisé.",
    founded: 2021, members: 320, email: "salut@voisinsdemalo.bzh", phone: "02 99 56 77 02",
    website: "voisinsdemalo.bzh", insta: "@voisins.malo", fb: "VoisinsDeMalo",
    tags: ["Entraide", "Lien social", "Intergénérationnel"], action: "Rejoindre le réseau", needs: "Voisins volontaires" },
  { slug: "second-souffle", name: "Second Souffle", cat: "soli", city: "Cherbourg", dept: "50",
    lat: 49.6337, lng: -1.6222,
    blurb: "Recyclerie & ateliers réemploi pour donner une 2ᵉ vie aux objets.",
    description: "Second Souffle collecte, répare et revend meubles, vélos et électroménager. La recyclerie emploie en insertion et anime des ateliers « répare toi-même » ouverts à tous le samedi.",
    founded: 2012, members: 150, email: "bonjour@secondsouffle.org", phone: "02 33 44 18 75",
    website: "secondsouffle.org", insta: "@second.souffle", fb: "SecondSouffleCherbourg",
    tags: ["Recyclerie", "Réemploi", "Insertion"], action: "Faire un don d'objet", needs: "Réparateurs vélo" },
];

async function main(): Promise<void> {
  const env = getEnv();
  const pool = new Pool({ connectionString: env.DATABASE_URL });

  const slugs = DEMO.map((d) => d.slug);
  // Nettoie les démos existantes (nouvelles + anciennes 'demo-*') pour rester idempotent.
  await pool.query(
    "DELETE FROM associations WHERE source = 'manual' AND (slug = ANY($1) OR slug LIKE 'demo-%')",
    [slugs],
  );

  for (const a of DEMO) {
    const region = regionFromDepartment(a.dept);
    const social = { website: a.website, instagram: a.insta, facebook: a.fb };
    const meta = { blurb: a.blurb, members: a.members, founded: a.founded, needs: a.needs, action: a.action };
    await pool.query(
      `INSERT INTO associations
        (slug, name, category_id, description, email, phone, website, city, department, region,
         tags, social, meta, status, source, location)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13::jsonb,'published','manual',
               ST_SetSRID(ST_MakePoint($14,$15),4326))`,
      [a.slug, a.name, a.cat, a.description, a.email, a.phone, a.website, a.city, a.dept, region,
       a.tags, JSON.stringify(social), JSON.stringify(meta), a.lng, a.lat],
    );
  }

  await pool.end();
  console.log(`✅ ${DEMO.length} associations de démo (maquette) insérées`);
  console.log("ℹ️  Lance `pnpm search:reindex` pour les indexer dans Meilisearch.");
}

main().catch((err) => {
  console.error("❌ Seed échoué :", err);
  process.exit(1);
});
