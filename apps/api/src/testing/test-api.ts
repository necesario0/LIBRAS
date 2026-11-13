import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createApp } from "../app.ts";
import type { AppOptions } from "../app.ts";
import type { AccountAdmin } from "../auth/auth-provider.ts";
import { SupabaseAuthAdmin } from "../auth/supabase-auth-admin.ts";
import { SupabaseAuth } from "../auth/supabase-auth.ts";
import { LOCAL_DATABASE_URL, loadConfig } from "../config.ts";
import { createDatabase } from "../db.ts";
import { expireDueHolds } from "../holds/expiry.ts";
import { startPickupSweeper } from "../holds/sweeper.ts";
import type { Database } from "../db.ts";
import type { Logger } from "../logger.ts";
import { CapturingEmailSender } from "./capturing-email-sender.ts";
import { FakeClock } from "./fake-clock.ts";

export interface TestApi {
  /** Send real HTTP requests here, for example fetch(api.baseUrl + "/health"). */
  baseUrl: string;
  /** The clock the API runs on. It stands still until the test moves it. */
  clock: FakeClock;
  /** Every email the API sent. Nothing leaves the machine. */
  emails: CapturingEmailSender;
  /** The API's connection to the real local PostgreSQL, for arranging the data a test needs. */
  db: Database;
  /**
   * Runs the Pickup Window expiry sweep now, on the test clock, and returns how many
   * Holds it expired. The product runs the same sweep on its own timer and on the database's schedule.
   */
  sweepPickupWindows(): Promise<number>;
  /** Stops the server and closes the database connections. Call it in `after`. */
  close(): Promise<void>;
}

export interface TestApiOptions extends AppOptions {
  /** Defaults to `TEST_DATABASE_URL`, then to the local Supabase PostgreSQL. */
  databaseUrl?: string;
  /**
   * Run the Pickup Window sweep on a timer of this many milliseconds, as the real server does
   * (every minute). Default: no timer, so a test decides when the sweep runs (`sweepPickupWindows`).
   */
  sweepIntervalMs?: number;
  /**
   * Wraps the real account administration (Supabase Auth), for a test that makes one of its calls
   * fail or do something more. Default: the real one, untouched.
   */
  wrapAccounts?: (accounts: AccountAdmin) => AccountAdmin;
}

const silentLogger: Logger = {
  info: () => {},
  error: () => {},
};

/**
 * Starts the real API on a free local port against the real local
 * PostgreSQL and the real local Supabase Auth. Tests talk to it over HTTP only.
 */
export async function startTestApi(options: TestApiOptions = {}): Promise<TestApi> {
  const logger = silentLogger;
  const db = createDatabase(options.databaseUrl ?? process.env.TEST_DATABASE_URL ?? LOCAL_DATABASE_URL, logger);
  const clock = new FakeClock();
  const emails = new CapturingEmailSender();
  const config = loadConfig();
  const auth = new SupabaseAuth({ url: config.supabaseUrl, publishableKey: config.supabasePublishableKey });
  const realAccounts = new SupabaseAuthAdmin({ url: config.supabaseUrl, secretKey: config.supabaseSecretKey });
  const accounts = options.wrapAccounts ? options.wrapAccounts(realAccounts) : realAccounts;
  const deps = { db, auth, accounts, clock, email: emails, logger };
  const { app, stop } = createApp(deps, options);

  const sweeper = options.sweepIntervalMs === undefined ? undefined : startPickupSweeper(deps, options.sweepIntervalMs);

  const server = await new Promise<Server>((resolve, reject) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
    listening.once("error", reject);
  });
  const { port } = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    clock,
    emails,
    db,
    sweepPickupWindows: () => expireDueHolds(deps),
    async close() {
      sweeper?.stop();
      stop();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      });
      await db.end();
    },
  };
}
