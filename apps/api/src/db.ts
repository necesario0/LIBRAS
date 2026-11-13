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

/** The client of a transaction run as the API itself (`withTransaction`). */
export type Tx = pg.PoolClient;

/** PostgreSQL's code for a unique index or constraint refusing a row. */
const UNIQUE_VIOLATION = "23505";

/** The unique index or constraint that refused a row, when `error` is that refusal; otherwise undefined. */
export function violatedUniqueConstraint(error: unknown): string | undefined {
  const refusal = error as { code?: unknown; constraint?: unknown } | null;
  if (typeof refusal !== "object" || refusal === null || refusal.code !== UNIQUE_VIOLATION) return undefined;
  return typeof refusal.constraint === "string" ? refusal.constraint : "";
}

/** Whether `error` is the unique index or constraint `constraint` refusing a row, and not any other one. */
export function isUniqueViolation(error: unknown, constraint: string): boolean {
  return violatedUniqueConstraint(error) === constraint;
}

export interface RetryOptions {
  /** How many times `attempt` runs at most. */
  attempts: number;
  /** Whether the failure is a conflict that a fresh attempt can get past. Anything else is thrown as it is. */
  isConflict: (error: unknown) => boolean;
  /** Work to do between a conflict and the next attempt (for example expiring the Hold that was in the way). */
  beforeRetry?: (error: unknown) => Promise<void>;
  /** The refusal to throw when the last attempt also ended in a conflict. */
  exhausted: () => Error;
}

/**
 * Runs `attempt` (one transaction) again when it ends in a conflict: a writer
 * that reads a row without a lock to learn which rows to lock (in the lock
 * order every writer keeps) finds, once it holds them, that something changed
 * in between. It rolls back, and a fresh attempt reads again. After
 * `attempts` tries, the caller's refusal is thrown.
 */
export async function retryOnConflict<T>(options: RetryOptions, attempt: () => Promise<T>): Promise<T> {
  for (let tried = 1; ; tried += 1) {
    try {
      return await attempt();
    } catch (error) {
      if (!options.isConflict(error)) throw error;
      if (tried >= options.attempts) throw options.exhausted();
      await options.beforeRetry?.(error);
    }
  }
}

/**
 * Runs `work` in one transaction on one connection: it commits when `work`
 * resolves and rolls back when it throws. Runs as the API itself, so
 * row-level security does not apply: use `withIdentity` for a person's own
 * data.
 */
export async function withTransaction<T>(db: Database, work: (client: Tx) => Promise<T>): Promise<T> {
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
