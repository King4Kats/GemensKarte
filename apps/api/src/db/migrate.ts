import * as fs from "node:fs";
import * as path from "node:path";
import { Pool } from "pg";
import { getEnv } from "../config/env";

/** Applique les migrations SQL de src/db/migrations dans l'ordre, une seule fois. */
async function main(): Promise<void> {
  const env = getEnv();
  const pool = new Pool({ connectionString: env.DATABASE_URL });

  await pool.query(
    `CREATE TABLE IF NOT EXISTS _migrations (
       name   text PRIMARY KEY,
       run_at timestamptz NOT NULL DEFAULT now()
     )`,
  );

  const dir = path.join(__dirname, "migrations");
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const already = await pool.query("SELECT 1 FROM _migrations WHERE name = $1", [file]);
    if ((already.rowCount ?? 0) > 0) {
      console.log(`⏭  ${file} (déjà appliquée)`);
      continue;
    }
    const sqlText = fs.readFileSync(path.join(dir, file), "utf8");
    const client = await pool.connect();
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

main().catch((err) => {
  console.error("❌ Échec des migrations :", err);
  process.exit(1);
});
