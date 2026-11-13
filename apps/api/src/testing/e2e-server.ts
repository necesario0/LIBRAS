// The API as the end-to-end tests run it: the real app with the real database
// and Supabase Auth, but emails are captured instead of sent, and a test can read
// them at GET /e2e/emails (see mailbox-routes.ts), and it can add Books to the
// catalog at POST /e2e/books (see catalog-fixture-routes.ts), and Visitor and Alumni Members
// at POST /e2e/members (see member-fixture-routes.ts), and it can have a Librarian confirm a
// Loan for a Member at POST /e2e/loans (see loan-fixture-routes.ts), and let a Hold's Pickup Window run out at
// POST /e2e/holds/lapse (same file).
//
//   node scripts/with-local-supabase.ts node src/testing/e2e-server.ts
//
// This is a separate entry point, not a switch on the real one, so production
// has no way to turn it on: `server.ts` never imports anything from here, and
// this file refuses to start when NODE_ENV=production. It also listens on the
// loopback address only (the Android emulator reaches it as 10.0.2.2).
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createApp } from "../app.ts";
import { SupabaseAuthAdmin } from "../auth/supabase-auth-admin.ts";
import { SupabaseAuth } from "../auth/supabase-auth.ts";
import { systemClock } from "../clock.ts";
import { loadConfig } from "../config.ts";
import { createDatabase } from "../db.ts";
import { startPickupSweeper } from "../holds/sweeper.ts";
import { consoleLogger } from "../logger.ts";
import { CapturingEmailSender } from "./capturing-email-sender.ts";
import { catalogFixtureRoutes } from "./catalog-fixture-routes.ts";
import { loanFixtureRoutes } from "./loan-fixture-routes.ts";
import { memberFixtureRoutes } from "./member-fixture-routes.ts";
import { mailboxRoutes } from "./mailbox-routes.ts";

// Read the repository's .env first, so a NODE_ENV set there is seen by the check below.
const envFile = fileURLToPath(new URL("../../../../.env", import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

if (process.env.NODE_ENV === "production") {
  console.error("The end-to-end server exposes captured emails and must never run in production.");
  process.exit(1);
}

const config = loadConfig();
const db = createDatabase(config.databaseUrl, consoleLogger);
const emails = new CapturingEmailSender();

const deps = {
  db,
  auth: new SupabaseAuth({ url: config.supabaseUrl, publishableKey: config.supabasePublishableKey }),
  accounts: new SupabaseAuthAdmin({ url: config.supabaseUrl, secretKey: config.supabaseSecretKey }),
  clock: systemClock,
  email: emails,
  logger: consoleLogger,
};

const app = createApp(deps, {
  extraRoutes: (router, deps, { catalog }) => {
    mailboxRoutes(emails)(router);
    catalogFixtureRoutes(router, deps, catalog);
    memberFixtureRoutes(router, deps);
    loanFixtureRoutes(router, deps);
  },
  warmCatalog: true,
  // Every request reaches this server from the same address, so the real
  // limit would lock the next test run out after a few deliberate wrong
  // passwords. The block itself is proved by the API tests, not here.
  signInLimit: { maxFailures: 1_000, windowMinutes: 15 },
});

// Pickup Windows end on their own here too, as on the real server.
const sweeper = startPickupSweeper(deps);

const server = app.listen(config.port, "127.0.0.1", () => {
  consoleLogger.info(`LIBRAS end-to-end API (emails captured) on http://127.0.0.1:${config.port}`);
});

function shutdown(): void {
  sweeper.stop();
  server.close(() => {
    void db.end().finally(() => process.exit(0));
  });
  server.closeAllConnections();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
