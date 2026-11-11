import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.ts";
import { SupabaseAuth } from "./auth/supabase-auth.ts";
import { systemClock } from "./clock.ts";
import { loadConfig } from "./config.ts";
import { createDatabase } from "./db.ts";
import { ConsoleEmailSender, UnconfiguredEmailSender } from "./email.ts";
import { consoleLogger } from "./logger.ts";

// Local development reads the repository's .env file. Hosted environments set real variables.
const envFile = fileURLToPath(new URL("../../../.env", import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

const config = loadConfig();
const logger = consoleLogger;
const db = createDatabase(config.databaseUrl, logger);

const app = createApp({
  db,
  auth: new SupabaseAuth({ url: config.supabaseUrl, publishableKey: config.supabasePublishableKey }),
  clock: systemClock,
  email: config.isProduction ? new UnconfiguredEmailSender() : new ConsoleEmailSender(),
  logger,
});

const server = app.listen(config.port, () => {
  logger.info(`LIBRAS API listening on http://localhost:${config.port}`);
});

function shutdown(): void {
  server.close(() => {
    void db.end().finally(() => process.exit(0));
  });
  server.closeAllConnections();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
