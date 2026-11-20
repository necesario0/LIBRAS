import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.ts";
import { SupabaseAuthAdmin } from "./auth/supabase-auth-admin.ts";
import { SupabaseAuth } from "./auth/supabase-auth.ts";
import { systemClock } from "./clock.ts";
import { loadConfig } from "./config.ts";
import { announcementFiles } from "./announcements/storage.ts";
import { createDatabase } from "./db.ts";
import { BrevoEmailSender, ConsoleEmailSender } from "./email.ts";
import { consoleLogger } from "./logger.ts";
import { ExpoPushSender } from "./push/sender.ts";
import { startSweeper } from "./sweep.ts";

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
  files: announcementFiles(config),
  push: new ExpoPushSender({ accessToken: config.expoAccessToken }),
};

const { app, stop } = createApp(deps, {
  corsAllowedOrigins: config.corsAllowedOrigins,
  trustProxy: config.trustProxy,
  warmCatalog: true,
  sweepSecret: config.sweepSecret,
});

// Pickup Windows end and Loan notices go out on their own: sweep while the API runs (ADR 0007, ADR 0009).
const sweeper = startSweeper(deps);
if (!config.sweepSecret && config.isProduction) {
  logger.error("SWEEP_SECRET is not set: Pickup Windows expire and Loan notices go out only while this service is awake. See the API README, Pickup Window expiry.");
}

const server = app.listen(config.port, () => {
  logger.info(`LIBRAS API listening on http://localhost:${config.port}`);
});

function shutdown(): void {
  sweeper.stop();
  stop();
  server.close(() => {
    void db.end().finally(() => process.exit(0));
  });
  server.closeAllConnections();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
