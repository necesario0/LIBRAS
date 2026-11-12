import { Router } from "express";
import { CATALOG_SEARCH_MESSAGES, catalogSearchQuerySchema } from "@libras/shared";
import type { CatalogSearchResponse } from "@libras/shared";
import type { AppDeps } from "../app.ts";
import { requireMember } from "../auth/guards.ts";
import type { CatalogSearch } from "../catalog/catalog-search.ts";
import { AppError } from "../errors.ts";

/**
 * The catalog, for Members.
 *
 * THE SEAM FOR MEMBER SIGN-IN: every catalog route sits behind the one
 * `requireMember` guard below (`auth/guards.ts`). Member sign-in (#9) changes
 * what that guard accepts without touching this file.
 */
export function catalogRouter(deps: AppDeps, catalog: CatalogSearch): Router {
  const router = Router();
  router.use("/catalog", ...requireMember(deps));

  router.get("/catalog/search", async (req, res) => {
    const parsed = catalogSearchQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message;
      const known = Object.values(CATALOG_SEARCH_MESSAGES) as string[];
      throw new AppError(400, "invalid_request", message !== undefined && known.includes(message) ? message : CATALOG_SEARCH_MESSAGES.invalid);
    }
    const { q, limit } = parsed.data;
    const { total, results } = await catalog.search(q, limit);
    const body: CatalogSearchResponse = { query: q, total, results };
    res.json(body);
  });

  return router;
}
