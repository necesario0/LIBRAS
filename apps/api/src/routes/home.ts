import { Router } from "express";
import type { HomeResponse } from "@libras/shared";
import type { AppDeps } from "../app.ts";
import { memberOf, requireMember } from "../auth/guards.ts";
import { homeShelves } from "../home/shelves.ts";

/**
 * Home, for the signed-in Member: what the app shows besides the search bar. One call, so Home loads
 * in one go. Today it holds the shelves; the Announcement joins them in the same body.
 */
export function homeRouter(deps: AppDeps): Router {
  const router = Router();

  router.get("/home", ...requireMember(deps), async (_req, res) => {
    const body: HomeResponse = { shelves: await homeShelves(deps, memberOf(res)) };
    // The shelves depend on the signed-in Member and on live availability.
    res.set("Cache-Control", "no-store").json(body);
  });

  return router;
}
