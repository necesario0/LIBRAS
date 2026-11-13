import { createHash, timingSafeEqual } from "node:crypto";
import { Router } from "express";
import type { RequestHandler } from "express";
import type { AppDeps } from "../app.ts";
import { bearerToken } from "../auth/guards.ts";
import { AppError } from "../errors.ts";
import { expireDueHolds } from "../holds/expiry.ts";

/** Compares two secrets without leaking, through timing, how much of the guess was right. */
function sameSecret(given: string | undefined, expected: string): boolean {
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return given !== undefined && timingSafeEqual(digest(given), digest(expected));
}

/**
 * The calls the database's schedule makes (pg_cron through pg_net, ADR 0007), so
 * that work which must happen on time happens even when nobody uses the API and
 * the host has put the service to sleep: the request wakes it. Each call carries
 * the shared secret as a bearer token. Without a configured secret there are no
 * such routes. They are not part of the clients' API.
 *
 *   POST /internal/sweeps/pickup-expiry -> 200 { expired: number }
 */
export function sweepsRouter(deps: AppDeps, secret: string): Router {
  const router = Router();

  const requireSecret: RequestHandler = (req, _res, next) => {
    if (!sameSecret(bearerToken(req.get("authorization")), secret)) {
      throw new AppError(401, "invalid_sweep_secret", "The sweep secret is missing or wrong.");
    }
    next();
  };

  router.post("/internal/sweeps/pickup-expiry", requireSecret, async (_req, res) => {
    res.json({ expired: await expireDueHolds(deps) });
  });

  return router;
}
