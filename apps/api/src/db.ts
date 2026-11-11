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

/**
 * Runs `work` in one transaction on one connection: it commits when `work`
 * resolves and rolls back when it throws. Runs as the API itself, so
 * row-level security does not apply: use `withIdentity` for a person's own
 * data.
 */
export async function withTransaction<T>(db: Database, work: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await db.connect();
  try {
    await client.query("begin");
    const result = await work(client);
    await client.query("commit");
    client.release();
    return result;
  } catch (error) {
    try {
      await client.query("rollback");
      client.release();
    } catch (rollbackError) {
      // The connection is in an unknown state: drop it instead of returning it to the pool.
      client.release(rollbackError instanceof Error ? rollbackError : true);
    }
    throw error;
  }
}
