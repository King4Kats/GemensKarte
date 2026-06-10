/**
 * Script de MIGRATIONS de la base de données.
 * Une "migration" = un fichier .sql qui fait évoluer la structure de la base
 * (créer une table, ajouter une colonne, etc.). Ce script lit tous les fichiers
 * du dossier src/db/migrations, et applique chacun UNE SEULE FOIS, dans l'ordre.
 * On le lance en général une fois au démarrage / déploiement.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { Pool } from "pg"; // pg = client PostgreSQL pour parler à la base
import { getEnv } from "../config/env";

/** Applique les migrations SQL de src/db/migrations dans l'ordre, une seule fois. */
async function main(): Promise<void> {
  const env = getEnv();
  // Pool = réserve de connexions ouvertes vers la base, réutilisables.
  const pool = new Pool({ connectionString: env.DATABASE_URL });

  // Table "carnet de bord" : on y note le nom de chaque migration déjà jouée,
  // pour ne jamais la rejouer. On la crée si elle n'existe pas encore.
  await pool.query(
    `CREATE TABLE IF NOT EXISTS _migrations (
       name   text PRIMARY KEY,
       run_at timestamptz NOT NULL DEFAULT now()
     )`,
  );

  // On liste tous les fichiers .sql du dossier migrations, triés par nom.
  // Le tri garantit qu'ils s'appliquent toujours dans le même ordre
  // (d'où l'usage de noms comme 001_..., 002_...).
  const dir = path.join(__dirname, "migrations");
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  // On parcourt chaque fichier de migration un par un.
  for (const file of files) {
    // Déjà notée dans le carnet de bord ? Alors on la saute.
    const already = await pool.query("SELECT 1 FROM _migrations WHERE name = $1", [file]);
    if ((already.rowCount ?? 0) > 0) {
      console.log(`⏭  ${file} (déjà appliquée)`);
      continue;
    }
    const sqlText = fs.readFileSync(path.join(dir, file), "utf8");
    const client = await pool.connect();
    // Transaction : on enchaîne le SQL ET l'enregistrement dans _migrations.
    // Si une erreur survient, ROLLBACK annule tout (on ne reste pas à moitié migré).
    try {
      console.log(`▶️  ${file}`);
      await client.query("BEGIN");
      await client.query(sqlText);
      await client.query("INSERT INTO _migrations (name) VALUES ($1)", [file]);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  await pool.end();
  console.log("✅ Migrations à jour");
}

// Point d'entrée : on lance main(). Si ça plante, on affiche l'erreur
// et on quitte avec le code 1 (= "échec", utile pour les outils/CI).
main().catch((err) => {
  console.error("❌ Échec des migrations :", err);
  process.exit(1);
});
