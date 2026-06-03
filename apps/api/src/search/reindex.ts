import { MeiliSearch } from "meilisearch";
import { Pool } from "pg";
import { getEnv } from "../config/env";
import type { AssociationDoc } from "./search.service";

/** Réindexe toutes les associations publiées dans Meilisearch. */
async function main(): Promise<void> {
  const env = getEnv();
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  const client = new MeiliSearch({ host: env.MEILI_HOST, apiKey: env.MEILI_MASTER_KEY });

  await client.createIndex("associations", { primaryKey: "id" }).catch(() => undefined);
  const index = client.index<AssociationDoc>("associations");
  await index.updateSettings({
    searchableAttributes: ["name", "city", "tags", "description"],
    filterableAttributes: ["categoryId", "department"],
    sortableAttributes: ["name"],
  });

  // Purge l'index pour ne pas garder de documents supprimés (Meili ne fait pas
  // de diff : on repart propre). Les tâches Meili sont traitées dans l'ordre.
  await index.deleteAllDocuments();

  const { rows } = await pool.query<AssociationDoc>(
    `SELECT id, name, category_id AS "categoryId", description, city, department, tags
     FROM associations WHERE status = 'published'`,
  );

  if (rows.length > 0) {
    const task = await index.addDocuments(rows);
    console.log(`▶️  ${rows.length} documents envoyés (task #${task.taskUid})`);
  }

  await pool.end();
  console.log("✅ Réindexation lancée");
}

main().catch((err) => {
  console.error("❌ Réindexation échouée :", err);
  process.exit(1);
});
