import pg from "pg";
import type { Logger } from "./logger.ts";

export type Database = pg.Pool;

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]", "host.docker.internal"]);

/**
 * TLS settings for a connection string. The local Supabase PostgreSQL has no
 * TLS. Any other database (the hosted Supabase one) is reached over TLS: the
 * connection is always encrypted, and when `caCertificate` is given the
 * server's certificate is verified against it too. Supabase signs with its own
 * CA, which Node does not trust by default, so without the CA the certificate
 * cannot be checked. A connection string that names an `sslmode` is left alone.
 */
export function databaseSsl(databaseUrl: string, caCertificate?: string): pg.ClientConfig["ssl"] {
  const url = new URL(databaseUrl);
  if (url.searchParams.has("sslmode")) return undefined;
  if (LOCAL_HOSTS.has(url.hostname)) return false;
  return caCertificate ? { ca: caCertificate, rejectUnauthorized: true } : { rejectUnauthorized: false };
}

export function createDatabase(databaseUrl: string, logger: Logger, caCertificate?: string): Database {
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    ssl: databaseSsl(databaseUrl, caCertificate),
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
