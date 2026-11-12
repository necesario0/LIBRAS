import express from "express";
import type { Express, Router } from "express";
import type { AccountAdmin, AuthProvider } from "./auth/auth-provider.ts";
import { SignInLimiter } from "./auth/sign-in-limit.ts";
import type { SignInLimitOptions } from "./auth/sign-in-limit.ts";
import type { Clock } from "./clock.ts";
import { cors } from "./cors.ts";
import type { Database } from "./db.ts";
import type { EmailSender } from "./email.ts";
import { createErrorHandler, notFoundHandler } from "./errors.ts";
import type { Logger } from "./logger.ts";
import { CatalogSearch } from "./catalog/catalog-search.ts";
import { authRouter } from "./routes/auth.ts";
import { ScannerHub } from "./scanner/hub.ts";
import type { ScannerOptions } from "./scanner/hub.ts";
import { catalogRouter } from "./routes/catalog.ts";
import { digitalIdRouter } from "./routes/digital-id.ts";
import { healthRouter } from "./routes/health.ts";
import { holdsRouter } from "./routes/holds.ts";
import { loansRouter } from "./routes/loans.ts";
import { membersRouter } from "./routes/members.ts";
import { scannerRouter } from "./routes/scanner.ts";
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
   * How many reverse proxies sit between the internet and the API. Express then
   * takes the client address from X-Forwarded-For that many hops from the end
   * (the sign-in limiter counts per client address). 0, the default, ignores
   * the header: use it when clients connect directly. A client can write
   * anything in X-Forwarded-For, so never set this higher than the real number
   * of proxies. See the API README, "Client address and proxies".
   */
  trustProxy?: number;
  /** Sign-in rate limit. Default: 5 failures per 15 minutes per client address. */
  signInLimit?: SignInLimitOptions;
  /** Pairing-code rate limit. Default: 5 wrong codes per 5 minutes per client address. */
  pairingLimit?: SignInLimitOptions;
  /** The phone scanner: code life, grace time, stream life, scan rate. The defaults are the product. */
  scanner?: ScannerOptions;
  /**
   * Adds routes after the real ones and before the error handling. For tests
   * that need a route the product does not have, such as one that throws.
   */
  extraRoutes?: (router: Router, deps: AppDeps, services: { catalog: CatalogSearch }) => void;
}

/** A wrong pairing code five times in five minutes blocks the address for the rest of the window. */
const DEFAULT_PAIRING_LIMIT: SignInLimitOptions = { maxFailures: 5, windowMinutes: 5 };

export function createApp(deps: AppDeps, options: AppOptions = {}): Express {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", options.trustProxy ?? 0);
  const signInLimiter = new SignInLimiter(deps.clock, options.signInLimit);
  const pairingLimiter = new SignInLimiter(deps.clock, options.pairingLimit ?? DEFAULT_PAIRING_LIMIT, "wrong pairing codes");
  const scannerHub = new ScannerHub(deps.clock, options.scanner);
  app.use(cors(options.corsAllowedOrigins ?? []));
  app.use(express.json({ limit: "100kb" }));

  // Each feature adds its router here.
  app.use(healthRouter(deps));
  app.use(authRouter(deps));
  app.use(staffRouter(deps, signInLimiter));
  app.use(membersRouter(deps, signInLimiter));
  app.use(digitalIdRouter(deps));
  app.use(holdsRouter(deps));
  app.use(loansRouter(deps));
  const catalog = new CatalogSearch(deps.db, deps.logger);
  app.use(scannerRouter(deps, scannerHub, pairingLimiter));
  app.use(catalogRouter(deps, catalog));
  if (options.warmCatalog) void catalog.warm();

  if (options.extraRoutes) {
    const extra = express.Router();
    options.extraRoutes(extra, deps, { catalog });
    app.use(extra);
  }

  app.use(notFoundHandler);
  app.use(createErrorHandler(deps.logger));
  return app;
}
