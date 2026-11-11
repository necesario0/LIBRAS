import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createApp } from "../app.ts";
import type { AppOptions } from "../app.ts";
import { LOCAL_DATABASE_URL } from "../config.ts";
import { createDatabase } from "../db.ts";
import type { Database } from "../db.ts";
import type { Logger } from "../logger.ts";
import { FakeClock } from "./fake-clock.ts";

export interface TestApi {
  /** Send real HTTP requests here, for example fetch(api.baseUrl + "/health"). */
  baseUrl: string;
  /** The clock the API runs on. It stands still until the test moves it. */
  clock: FakeClock;
  /** The API's connection to the real local PostgreSQL, for arranging the data a test needs. */
  db: Database;
  /** Stops the server and closes the database connections. Call it in `after`. */
  close(): Promise<void>;
}

export interface TestApiOptions extends AppOptions {
  /** Defaults to `TEST_DATABASE_URL`, then to the local Supabase PostgreSQL. */
  databaseUrl?: string;
}

const silentLogger: Logger = {
  info: () => {},
  error: () => {},
};

/**
 * Starts the real API on a free local port against the real local
 * PostgreSQL. Tests talk to it over HTTP only.
 */
export async function startTestApi(options: TestApiOptions = {}): Promise<TestApi> {
  const logger = silentLogger;
  const db = createDatabase(options.databaseUrl ?? process.env.TEST_DATABASE_URL ?? LOCAL_DATABASE_URL, logger);
  const clock = new FakeClock();
  const app = createApp({ db, clock, email: { send: async () => {} }, logger }, options);

  const server = await new Promise<Server>((resolve, reject) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
    listening.once("error", reject);
  });
  const { port } = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    clock,
    db,
    async close() {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      });
      await db.end();
    },
  };
}
