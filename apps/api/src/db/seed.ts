import { Pool } from "pg";
import { getEnv } from "../config/env";
import { departmentFromPostalCode, regionFromDepartment } from "../geo/regions";

/** Données de démonstration (mêmes assos que le prototype) avec coordonnées réelles Nantes. */
const DEMO = [
  { slug: "demo-treteaux-erdre", name: "Les Tréteaux de l'Erdre", category: "culture",
    desc: "Troupe de théâtre amateur ouverte à tous, ateliers d'impro le mardi soir.",
    addr: "12 quai de Versailles", cp: "44000", city: "Nantes", lng: -1.5556, lat: 47.2241,
    email: "contact@treteaux-erdre.fr", phone: "02 40 12 34 56",
    tags: ["Théâtre", "Tous âges", "Ateliers"] },
  { slug: "demo-graines-quartier", name: "Graines de Quartier", category: "eco",
    desc: "Jardins partagés et compostage collectif pour reverdir la ville ensemble.",
    addr: "5 rue du Jardin", cp: "44100", city: "Nantes", lng: -1.5731, lat: 47.2098,
    email: "hello@grainesdequartier.org", phone: "02 40 98 76 54",
    tags: ["Jardinage", "Compost", "Famille"] },
  { slug: "demo-roll-atlantique", name: "Roll'Atlantique", category: "sport",
    desc: "Club de roller pour petits et grands, balades urbaines tous les vendredis.",
    addr: "Parc des sports", cp: "44200", city: "Nantes", lng: -1.5402, lat: 47.1975,
    email: "club@rollatlantique.fr", phone: "02 40 55 11 22",
    tags: ["Roller", "Loisirs", "Débutants"] },
  { slug: "demo-solidarite-voisins", name: "Solidarité Voisins", category: "social",
    desc: "Réseau d'entraide de quartier : courses, visites, coups de main solidaires.",
    addr: "3 place du Marché", cp: "44300", city: "Nantes", lng: -1.5288, lat: 47.2512,
    email: "aide@solidarite-voisins.fr", phone: "02 40 33 44 55",
    tags: ["Entraide", "Bénévolat", "Seniors"] },
  { slug: "demo-cap-avenir", name: "Cap sur l'Avenir", category: "jeunesse",
    desc: "Aide aux devoirs et accompagnement scolaire pour les collégiens du quartier.",
    addr: "18 rue de l'École", cp: "44400", city: "Rezé", lng: -1.5670, lat: 47.1850,
    email: "contact@capsuravenir.fr", phone: "02 40 66 77 88",
    tags: ["Soutien scolaire", "Jeunes", "Gratuit"] },
  { slug: "demo-vinyles-cie", name: "Vinyles & Compagnie", category: "culture",
    desc: "Passionnés de musique : concerts intimistes et bourses aux vinyles.",
    addr: "7 rue Mercoeur", cp: "44000", city: "Nantes", lng: -1.5510, lat: 47.2165,
    email: "bonjour@vinylesetcie.fr", phone: "02 40 22 33 44",
    tags: ["Musique", "Concerts", "Vinyles"] },
  { slug: "demo-bulle-bienetre", name: "Bulle de Bien-être", category: "sante",
    desc: "Yoga, sophrologie et ateliers anti-stress accessibles à prix libre.",
    addr: "22 bd des Belges", cp: "44300", city: "Nantes", lng: -1.5365, lat: 47.2390,
    email: "info@bulledebienetre.fr", phone: "02 40 77 88 99",
    tags: ["Yoga", "Bien-être", "Prix libre"] },
  { slug: "demo-velo-pour-tous", name: "Vélo pour Tous", category: "eco",
    desc: "Atelier d'auto-réparation de vélos et promotion de la mobilité douce.",
    addr: "9 rue du Cycle", cp: "44100", city: "Nantes", lng: -1.5790, lat: 47.2150,
    email: "atelier@velopourtous.org", phone: "02 40 44 55 66",
    tags: ["Vélo", "Réparation", "Mobilité"] },
];

async function main(): Promise<void> {
  const env = getEnv();
  const pool = new Pool({ connectionString: env.DATABASE_URL });

  await pool.query("DELETE FROM associations WHERE slug LIKE 'demo-%'");

  for (const a of DEMO) {
    const dept = departmentFromPostalCode(a.cp);
    const region = regionFromDepartment(dept);
    await pool.query(
      `INSERT INTO associations
        (slug, name, category_id, description, email, phone, address, postal_code, city,
         department, region, tags, status, source, location)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'published','manual',
               ST_SetSRID(ST_MakePoint($13,$14),4326))`,
      [a.slug, a.name, a.category, a.desc, a.email, a.phone, a.addr, a.cp, a.city,
       dept, region, a.tags, a.lng, a.lat],
    );
  }

  await pool.end();
  console.log(`✅ ${DEMO.length} associations de démo insérées`);
  console.log("ℹ️  Lance `pnpm search:reindex` pour les indexer dans Meilisearch.");
}

main().catch((err) => {
  console.error("❌ Seed échoué :", err);
  process.exit(1);
});
