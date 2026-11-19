import { Router } from "express";
import type { Announcement, HomeResponse, MemberAnnouncement } from "@libras/shared";
import type { AppDeps } from "../app.ts";
import { runningAnnouncement } from "../announcements/index.ts";
import { memberOf, requireMember } from "../auth/guards.ts";
import { homeShelves } from "../home/shelves.ts";

/**
 * Home, for the signed-in Member: what the app shows besides the search bar. One call, so Home loads
 * in one go. It holds the running Announcement and the shelves.
 */
export function homeRouter(deps: AppDeps): Router {
  const router = Router();

  router.get("/home", ...requireMember(deps), async (_req, res) => {
    const [running, shelves] = await Promise.all([runningAnnouncement(deps, deps.clock.now()), homeShelves(deps, memberOf(res))]);
    const body: HomeResponse = { announcement: running === undefined ? null : toMemberAnnouncement(running), shelves };
    // The shelves depend on the signed-in Member and on live availability.
    res.set("Cache-Control", "no-store").json(body);
  });

  return router;
}

/** What a Member may see of an Announcement: the desk's Librarian names, status and edit time stay behind. */
function toMemberAnnouncement({ id, title, body, link, image, firstDay, lastDay, startsAt, endsAt }: Announcement): MemberAnnouncement {
  return { id, title, body, link, image, firstDay, lastDay, startsAt, endsAt };
}
