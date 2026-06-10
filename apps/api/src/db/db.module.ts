/**
 * Module "base de données" : il met en place la connexion à PostgreSQL et la
 * rend disponible partout dans l'API. Il fournit deux outils réutilisables :
 *  - PG_POOL : le "pool" de connexions (un réservoir de connexions à la base,
 *              réutilisées pour ne pas en rouvrir une à chaque requête).
 *  - DB      : drizzle, l'ORM (outil qui permet d'écrire des requêtes SQL en
 *              TypeScript, avec l'aide de l'autocomplétion).
 * @Global() = ces outils sont accessibles dans toute l'app sans réimport.
 */
import { Global, Module } from "@nestjs/common";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { getEnv } from "../config/env";
import { schema } from "./schema";

// Étiquettes uniques (Symbol) servant de "clés" pour réclamer ces outils ailleurs.
export const DB = Symbol("DB");
export const PG_POOL = Symbol("PG_POOL");
// Type pratique : représente notre base de données typée selon le schéma.
export type Db = NodePgDatabase<typeof schema>;

@Global()
@Module({
  providers: [
    {
      // Crée le pool de connexions à partir de l'URL de la base (lue dans la config).
      provide: PG_POOL,
      useFactory: (): Pool => new Pool({ connectionString: getEnv().DATABASE_URL }),
    },
    {
      // Crée drizzle par-dessus le pool ; inject: [PG_POOL] lui passe le pool ci-dessus.
      provide: DB,
      useFactory: (pool: Pool): Db => drizzle(pool, { schema }),
      inject: [PG_POOL],
    },
  ],
  // On expose DB et PG_POOL pour que les autres modules puissent les utiliser.
  exports: [DB, PG_POOL],
})
export class DbModule {}
