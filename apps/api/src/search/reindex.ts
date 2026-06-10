/**
 * Script à lancer "à la main" (en ligne de commande) pour (re)remplir le moteur
 * de recherche Meilisearch avec toutes les associations publiées.
 * Il lit la base PostgreSQL, vide l'index, puis renvoie tout dedans.
 * Utile au premier démarrage ou pour repartir d'un index propre.
 */
import { MeiliSearch } from "meilisearch";
import { Pool } from "pg";
import { getEnv } from "../config/env";
import { CAT_LABEL, SEARCH_SYNONYMS, type AssociationDoc } from "./search.service";

/** Réindexe toutes les associations publiées dans Meilisearch. */
async function main(): Promise<void> {
  // getEnv() lit les variables d'environnement (URL de la base, adresse de Meili, clé secrète).
  // Pool = un groupe de connexions réutilisables vers PostgreSQL.
  const env = getEnv();
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  const client = new MeiliSearch({ host: env.MEILI_HOST, apiKey: env.MEILI_MASTER_KEY });

  // Crée l'index "associations" (= la "table" du moteur de recherche). Le .catch()
  // ignore l'erreur s'il existe déjà : on veut juste s'assurer qu'il est là.
  await client.createIndex("associations", { primaryKey: "id" }).catch(() => undefined);
  const index = client.index<AssociationDoc>("associations");
  // Réglages de l'index : quels champs sont cherchables, filtrables, triables, et les synonymes.
  await index.updateSettings({
    searchableAttributes: ["name", "city", "categoryLabel", "tags", "description"],
    filterableAttributes: ["categoryId", "department"],
    sortableAttributes: ["name"],
    synonyms: SEARCH_SYNONYMS,
  });

  // Purge l'index pour ne pas garder de documents supprimés (Meili ne fait pas
  // de diff : on repart propre). Les tâches Meili sont traitées dans l'ordre.
  await index.deleteAllDocuments();

  // Va chercher en base toutes les associations "published" (visibles au public).
  const { rows } = await pool.query<Omit<AssociationDoc, "categoryLabel">>(
    `SELECT id, name, category_id AS "categoryId", description, city, department, tags
     FROM associations WHERE status = 'published'`,
  );
  // On ajoute à chaque ligne le libellé lisible de la catégorie (ex. "culture" -> "Culture").
  const docs: AssociationDoc[] = rows.map((r) => ({
    ...r,
    categoryLabel: CAT_LABEL[r.categoryId] ?? "",
  }));

  if (docs.length > 0) {
    const task = await index.addDocuments(docs);
    console.log(`▶️  ${docs.length} documents envoyés (task #${task.taskUid})`);
  }

  await pool.end();
  console.log("✅ Réindexation lancée");
}

// Point d'entrée : on lance main(). Si une erreur survient, on l'affiche et on
// quitte avec un code d'erreur (1) pour signaler l'échec au terminal.
main().catch((err) => {
  console.error("❌ Réindexation échouée :", err);
  process.exit(1);
});
