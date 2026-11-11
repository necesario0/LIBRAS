import type pg from "pg";
import type { Database } from "../db.ts";
import type { Identity } from "./auth-provider.ts";

/** Runs queries as one signed-in person, inside one transaction. */
export type IdentityScope = Pick<pg.PoolClient, "query">;

/**
 * Passes the signed-in identity through to PostgreSQL, so row-level security
 * applies as the second layer behind the API checks.
 *
 * Everything `work` runs through `scope` is one transaction that runs as the
 * `authenticated` role with `auth.uid()` equal to `identity.userId`, which is
 * what the policies read. The role and the identity are set for that
 * transaction only, so nothing leaks to the next request that reuses the
 * pooled connection. The transaction commits when `work` resolves and rolls
 * back when it throws.
 *
 * Queries sent straight to `deps.db` run as the API itself and bypass
 * row-level security. Use them only for work that is not on behalf of one
 * person, such as the seed script or Hold dispatch.
 */
export async function withIdentity<T>(
  db: Database,
  identity: Identity,
  work: (scope: IdentityScope) => Promise<T>,
): Promise<T> {
  const claims = JSON.stringify({ sub: identity.userId, email: identity.email, role: "authenticated" });
  const client = await db.connect();
  try {
    await client.query("begin");
    await client.query(
      "select set_config('role', 'authenticated', true), set_config('request.jwt.claims', $1, true)",
      [claims],
    );
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
