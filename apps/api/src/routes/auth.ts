import { Router } from "express";
import { refreshSessionRequestSchema, signOutRequestSchema } from "@libras/shared";
import type { RefreshSessionResponse } from "@libras/shared";
import type { AppDeps } from "../app.ts";
import { bearerToken, notSignedIn } from "../auth/guards.ts";
import { forgetPushDevice } from "../push/index.ts";
import { parseBody } from "../validation.ts";

/** Session upkeep shared by every signed-in client: staff now, Members later. */
export function authRouter({ auth, db }: AppDeps): Router {
  const router = Router();

  router.post("/auth/refresh", async (req, res) => {
    const { refreshToken } = parseBody(refreshSessionRequestSchema, req.body, "Please sign in again.");
    const signedIn = await auth.refresh(refreshToken);
    if (!signedIn) throw notSignedIn();
    const body: RefreshSessionResponse = { session: signedIn.session };
    res.json(body);
  });

  // Signing out always succeeds: a session that is already gone is signed out. With the phone's push
  // token in the body (`signOutRequestSchema`), the phone also stops getting push notifications. That
  // needs no live session: a session that ended on its own still signs out, and only the phone knows
  // its token. A body that is not valid is ignored.
  router.post("/auth/sign-out", async (req, res) => {
    const body = signOutRequestSchema.safeParse(req.body ?? {});
    if (body.success && body.data.pushToken !== undefined) await forgetPushDevice(db, body.data.pushToken);
    const accessToken = bearerToken(req.get("authorization"));
    if (accessToken !== undefined) await auth.signOut(accessToken);
    res.status(204).end();
  });

  return router;
}
