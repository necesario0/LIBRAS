import express from "express";
import type { Express, Router } from "express";
import type { Clock } from "./clock.ts";
import type { Database } from "./db.ts";
import type { EmailSender } from "./email.ts";
import { createErrorHandler, notFoundHandler } from "./errors.ts";
import type { Logger } from "./logger.ts";
import { healthRouter } from "./routes/health.ts";

/** Everything the API reaches outside itself. Tests swap the clock and the email sender. */
export interface AppDeps {
  db: Database;
  clock: Clock;
  email: EmailSender;
  logger: Logger;
}

export interface AppOptions {
  /**
   * Adds routes after the real ones and before the error handling. For tests
   * that need a route the product does not have, such as one that throws.
   */
  extraRoutes?: (router: Router, deps: AppDeps) => void;
}

export function createApp(deps: AppDeps, options: AppOptions = {}): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "100kb" }));

  // Each feature adds its router here.
  app.use(healthRouter(deps));

  if (options.extraRoutes) {
    const extra = express.Router();
    options.extraRoutes(extra, deps);
    app.use(extra);
  }

  app.use(notFoundHandler);
  app.use(createErrorHandler(deps.logger));
  return app;
}
