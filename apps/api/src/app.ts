import express from "express";
import type { Express } from "express";
import type { Clock } from "./clock.ts";
import type { Database } from "./db.ts";
import type { EmailSender } from "./email.ts";
import type { Logger } from "./logger.ts";
import { healthRouter } from "./routes/health.ts";

/** Everything the API reaches outside itself. Tests swap the clock and the email sender. */
export interface AppDeps {
  db: Database;
  clock: Clock;
  email: EmailSender;
  logger: Logger;
}

export function createApp(deps: AppDeps): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "100kb" }));

  // Each feature adds its router here.
  app.use(healthRouter(deps));

  return app;
}
