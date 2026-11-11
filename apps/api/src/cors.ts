import type { RequestHandler } from "express";

const ALLOWED_METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS";
const ALLOWED_HEADERS = "Authorization, Content-Type";
const PREFLIGHT_MAX_AGE_SECONDS = "600";

/**
 * Lets browser pages on the listed origins call the API. Nothing else gets a
 * CORS header, so a page on any other origin cannot read a response.
 *
 * The clients send a bearer token in the Authorization header and never rely on
 * cookies, so credentials are not allowed. The mobile app is not a browser and
 * sends no Origin header: it is not affected.
 */
export function cors(allowedOrigins: readonly string[]): RequestHandler {
  const allowed = new Set(allowedOrigins);
  return (req, res, next) => {
    const origin = req.get("origin");
    if (origin === undefined || !allowed.has(origin)) {
      next();
      return;
    }
    res.vary("Origin");
    res.set("Access-Control-Allow-Origin", origin);
    if (req.method === "OPTIONS" && req.get("access-control-request-method") !== undefined) {
      res.set("Access-Control-Allow-Methods", ALLOWED_METHODS);
      res.set("Access-Control-Allow-Headers", ALLOWED_HEADERS);
      res.set("Access-Control-Max-Age", PREFLIGHT_MAX_AGE_SECONDS);
      res.status(204).end();
      return;
    }
    next();
  };
}
