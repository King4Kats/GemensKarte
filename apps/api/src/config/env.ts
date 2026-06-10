/**
 * Configuration de l'API à partir des variables d'environnement (.env).
 * Ce fichier lit les réglages (port, URL de la base, clés...) et vérifie qu'ils
 * sont présents et corrects au démarrage. Si une valeur manque, l'API refuse de
 * démarrer : mieux vaut une erreur claire tout de suite qu'un bug mystérieux plus tard.
 */
import * as path from "node:path";
import * as dotenv from "dotenv";
import { z } from "zod";

// Drapeau pour ne charger les fichiers .env qu'une seule fois (évite de relire inutilement).
let loaded = false;

/** Charge le .env racine du monorepo puis un .env local éventuel. */
export function loadEnv(): void {
  if (loaded) return;
  // Quand l'API est lancée via `pnpm --filter @gemenskarte/api`, cwd = apps/api
  dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });
  dotenv.config(); // apps/api/.env (override local), facultatif
  loaded = true;
}

// "Fiche de contrôle" des variables attendues : leur type, leur format et leur valeur par défaut.
// z.coerce.number = convertit le texte du .env en nombre ; .url() exige une adresse web valide.
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

// On garde en mémoire la config validée pour ne pas la recalculer à chaque appel.
let cached: Env | null = null;

/**
 * Renvoie la configuration validée de l'API.
 * Premier appel : on charge le .env, on vérifie tout avec le schéma, et si une
 * valeur est invalide on affiche le problème puis on arrête le programme (exit 1).
 */
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
