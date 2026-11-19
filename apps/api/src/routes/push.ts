import { Router } from "express";
import { pushDeviceRequestSchema, pushSettingsChangeSchema } from "@libras/shared";
import type { PushSettingsResponse } from "@libras/shared";
import type { AppDeps } from "../app.ts";
import { memberOf, requireMember } from "../auth/guards.ts";
import { changePushSettings, pushSettingsOf, registerPushDevice } from "../push/index.ts";
import { parseBody } from "../validation.ts";

/**
 * A Member's push notifications: the switch of each kind, and the phone that
 * gets them. A phone stops getting them at sign-out (`POST /auth/sign-out`).
 */
export function pushRouter(deps: AppDeps): Router {
  const router = Router();

  router.get("/members/me/push-settings", ...requireMember(deps), async (_req, res) => {
    const body: PushSettingsResponse = { settings: await pushSettingsOf(deps.db, memberOf(res).id) };
    res.json(body);
  });

  router.patch("/members/me/push-settings", ...requireMember(deps), async (req, res) => {
    const change = parseBody(pushSettingsChangeSchema, req.body, "Say which switches to turn on or off.");
    const body: PushSettingsResponse = { settings: await changePushSettings(deps.db, memberOf(res).id, change) };
    res.json(body);
  });

  // Repeating it is harmless: the app registers on every start, as a token can change.
  router.put("/members/me/push-device", ...requireMember(deps), async (req, res) => {
    const { token } = parseBody(pushDeviceRequestSchema, req.body, "This phone's push token is not valid.");
    await registerPushDevice(deps, memberOf(res).id, token);
    res.status(204).end();
  });

  return router;
}
