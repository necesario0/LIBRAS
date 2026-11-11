import { Router } from "express";
import { refreshSessionRequestSchema } from "@libras/shared";
import type { RefreshSessionResponse } from "@libras/shared";
import type { AppDeps } from "../app.ts";
import { bearerToken, notSignedIn } from "../auth/guards.ts";
import { parseBody } from "../validation.ts";

/** Session upkeep shared by every signed-in client: staff now, Members later. */
export function authRouter({ auth }: AppDeps): Router {
  const router = Router();

  router.post("/auth/refresh", async (req, res) => {
    const { refreshToken } = parseBody(refreshSessionRequestSchema, req.body, "Please sign in again.");
    const signedIn = await auth.refresh(refreshToken);
    if (!signedIn) throw notSignedIn();
    const body: RefreshSessionResponse = { session: signedIn.session };
    res.json(body);
  });

  // Signing out always succeeds: a session that is already gone is signed out.
  router.post("/auth/sign-out", async (req, res) => {
    const accessToken = bearerToken(req.get("authorization"));
    if (accessToken !== undefined) await auth.signOut(accessToken);
    res.status(204).end();
  });

  return router;
}
