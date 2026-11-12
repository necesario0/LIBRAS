import { Router } from "express";
import { identifyMemberRequestSchema } from "@libras/shared";
import type { DigitalIdResponse, IdentifyMemberResponse } from "@libras/shared";
import type { AppDeps } from "../app.ts";
import { identityOf, memberOf, requireLibrarian, requireMember } from "../auth/guards.ts";
import { deskMember } from "../desk/members.ts";
import { currentDigitalId, verifyDigitalId } from "../digital-id/index.ts";
import { parseBody } from "../validation.ts";

/** The Member's Digital ID, and the desk identifying a Member by it. */
export function digitalIdRouter(deps: AppDeps): Router {
  const router = Router();

  router.get("/members/me/digital-id", ...requireMember(deps), async (_req, res) => {
    const body: DigitalIdResponse = await currentDigitalId(deps, memberOf(res).id);
    // A code is a short-lived credential: no cache may keep it.
    res.set("Cache-Control", "no-store").json(body);
  });

  router.post("/desk/members/identify", ...requireLibrarian(deps), async (req, res) => {
    const { code } = parseBody(
      identifyMemberRequestSchema,
      req.body,
      "A Digital ID is 12 digits. Scan it again or type the code beneath the barcode.",
    );
    const { memberId } = await verifyDigitalId(deps, code);
    const body: IdentifyMemberResponse = { member: await deskMember(deps.db, identityOf(res), memberId) };
    res.json(body);
  });

  return router;
}
