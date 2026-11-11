import pg from "pg";
import type { Logger } from "./logger.ts";

export type Database = pg.Pool;

export function createDatabase(databaseUrl: string, logger: Logger): Database {
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 5_000,
  });
  // An idle client can lose its connection. Without a listener that would crash the process.
  pool.on("error", (error) => logger.error("Idle PostgreSQL client error", error));
  return pool;
}
