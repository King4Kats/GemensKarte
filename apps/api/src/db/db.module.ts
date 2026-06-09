import { Global, Module } from "@nestjs/common";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { getEnv } from "../config/env";
import { schema } from "./schema";

export const DB = Symbol("DB");
export const PG_POOL = Symbol("PG_POOL");
export type Db = NodePgDatabase<typeof schema>;

@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      useFactory: (): Pool => new Pool({ connectionString: getEnv().DATABASE_URL }),
    },
    {
      provide: DB,
      useFactory: (pool: Pool): Db => drizzle(pool, { schema }),
      inject: [PG_POOL],
    },
  ],
  exports: [DB, PG_POOL],
})
export class DbModule {}
