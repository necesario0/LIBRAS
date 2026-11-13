import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.ts";
import { SupabaseAuthAdmin } from "./auth/supabase-auth-admin.ts";
import { SupabaseAuth } from "./auth/supabase-auth.ts";
import { systemClock } from "./clock.ts";
import { loadConfig } from "./config.ts";
import { createDatabase } from "./db.ts";
import { BrevoEmailSender, ConsoleEmailSender } from "./email.ts";
import { startPickupSweeper } from "./holds/sweeper.ts";
import { consoleLogger } from "./logger.ts";

// Local development reads the repository's .env file. Hosted environments set real variables.
const envFile = fileURLToPath(new URL("../../../.env", import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

const config = loadConfig();
const logger = consoleLogger;
const db = createDatabase(config.databaseUrl, logger, config.databaseCaCertificate);

const email = config.email
  ? new BrevoEmailSender({ apiKey: config.email.apiKey, from: { address: config.email.fromAddress, name: config.email.fromName } })
  : new ConsoleEmailSender();

const deps = {
  db,
  auth: new SupabaseAuth({ url: config.supabaseUrl, publishableKey: config.supabasePublishableKey }),
  accounts: new SupabaseAuthAdmin({ url: config.supabaseUrl, secretKey: config.supabaseSecretKey }),
  clock: systemClock,
  email,
  logger,
};

const app = createApp(deps, {
  corsAllowedOrigins: config.corsAllowedOrigins,
  trustProxy: config.trustProxy,
  warmCatalog: true,
  sweepSecret: config.sweepSecret,
});

// Pickup Windows end on their own: sweep while the API runs (ADR 0007).
const sweeper = startPickupSweeper(deps);
if (!config.sweepSecret && config.isProduction) {
  logger.error("SWEEP_SECRET is not set: Pickup Windows expire only while this service is awake. See the API README, Pickup Window expiry.");
}

const server = app.listen(config.port, () => {
  logger.info(`LIBRAS API listening on http://localhost:${config.port}`);
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
