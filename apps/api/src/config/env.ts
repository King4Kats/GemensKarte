import * as path from "node:path";
import * as dotenv from "dotenv";
import { z } from "zod";

let loaded = false;

/** Charge le .env racine du monorepo puis un .env local éventuel. */
export function loadEnv(): void {
  if (loaded) return;
  // Quand l'API est lancée via `pnpm --filter @gemenskarte/api`, cwd = apps/api
  dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });
  dotenv.config(); // apps/api/.env (override local), facultatif
  loaded = true;
}

const EnvSchema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().int().default(3000),
  CORS_ORIGIN: z.string().default("*"),
  DATABASE_URL: z.string().url(),
  MEILI_HOST: z.string().url(),
  MEILI_MASTER_KEY: z.string().min(1),
  BAN_GEOCODER_URL: z.string().url().default("https://api-adresse.data.gouv.fr"),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) return cached;
  loadEnv();
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error(
      "❌ Configuration invalide (.env) :",
      JSON.stringify(parsed.error.flatten().fieldErrors, null, 2),
    );
    process.exit(1);
  }
  cached = parsed.data;
  return cached;
}
