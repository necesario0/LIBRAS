import express from "express";
import type { Express, Router } from "express";
import type { AccountAdmin, AuthProvider } from "./auth/auth-provider.ts";
import type { Clock } from "./clock.ts";
import { cors } from "./cors.ts";
import type { Database } from "./db.ts";
import type { EmailSender } from "./email.ts";
import { createErrorHandler, notFoundHandler } from "./errors.ts";
import type { Logger } from "./logger.ts";
import { authRouter } from "./routes/auth.ts";
import { CatalogSearch } from "./catalog/catalog-search.ts";
import { catalogRouter } from "./routes/catalog.ts";
import { healthRouter } from "./routes/health.ts";
import { membersRouter } from "./routes/members.ts";
import { staffRouter } from "./routes/staff.ts";

/** Everything the API reaches outside itself. Tests swap the clock and the email sender. */
export interface AppDeps {
  db: Database;
  /** Accounts, passwords and sessions (Supabase Auth). */
  auth: AuthProvider;
  /** Creates accounts and confirms their email: the sign-up flow only. */
  accounts: AccountAdmin;
  clock: Clock;
  email: EmailSender;
  logger: Logger;
}

export interface AppOptions {
  /** Origins of web pages that may call the API from a browser (exact, e.g. https://desk.example.com). Default: none. */
  corsAllowedOrigins?: readonly string[];
  /** Build the catalog search index at startup instead of on the first search. The real server turns it on. */
  warmCatalog?: boolean;
  /**
   * Adds routes after the real ones and before the error handling. For tests
   * that need a route the product does not have, such as one that throws.
   */
  extraRoutes?: (router: Router, deps: AppDeps) => void;
}

export function createApp(deps: AppDeps, options: AppOptions = {}): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(cors(options.corsAllowedOrigins ?? []));
  app.use(express.json({ limit: "100kb" }));

  // Each feature adds its router here.
  app.use(healthRouter(deps));
  app.use(authRouter(deps));
  app.use(staffRouter(deps));
  app.use(membersRouter(deps));
  const catalog = new CatalogSearch(deps.db, deps.logger);
  app.use(catalogRouter(deps, catalog));
  if (options.warmCatalog) void catalog.warm();

  if (options.extraRoutes) {
    const extra = express.Router();
    options.extraRoutes(extra, deps);
    app.use(extra);
  }

  app.use(notFoundHandler);
  app.use(createErrorHandler(deps.logger));
  return app;
}
