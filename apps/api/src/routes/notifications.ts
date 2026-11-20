import { Router } from "express";
import { NOTIFICATION_MESSAGES, notificationIdSchema, notificationsQuerySchema } from "@libras/shared";
import type { MyNotificationsResponse, NotificationsUnreadResponse } from "@libras/shared";
import type { AppDeps } from "../app.ts";
import { identityOf, requireMember } from "../auth/guards.ts";
import { AppError } from "../errors.ts";
import { listNotifications, markAllNotificationsRead, markNotificationRead, unreadNotifications } from "../notifications/index.ts";
import { parseBody } from "../validation.ts";

/**
 * A Member's notification inbox: list their Notifications a page at a time,
 * count the unread ones, mark one read, mark all read. Marking can be repeated.
 */
export function notificationsRouter(deps: AppDeps): Router {
  const router = Router();

  router.get("/members/me/notifications", ...requireMember(deps), async (req, res) => {
    const { before } = parseBody(notificationsQuerySchema, req.query, NOTIFICATION_MESSAGES.invalidCursor);
    const body: MyNotificationsResponse = await listNotifications(deps, identityOf(res), before);
    res.set("Cache-Control", "no-store").json(body);
  });

  router.get("/members/me/notifications/unread", ...requireMember(deps), async (_req, res) => {
    const body: NotificationsUnreadResponse = { unread: await unreadNotifications(deps, identityOf(res)) };
    res.set("Cache-Control", "no-store").json(body);
  });

  // Before `/:id/read`, which would otherwise read "read-all" as an id.
  router.post("/members/me/notifications/read-all", ...requireMember(deps), async (_req, res) => {
    const body: NotificationsUnreadResponse = { unread: await markAllNotificationsRead(deps, identityOf(res)) };
    res.json(body);
  });

  router.post("/members/me/notifications/:id/read", ...requireMember(deps), async (req, res) => {
    const id = notificationIdSchema.safeParse(req.params.id);
    if (!id.success) throw new AppError(400, "invalid_request", NOTIFICATION_MESSAGES.invalidId);
    const body: NotificationsUnreadResponse = { unread: await markNotificationRead(deps, identityOf(res), id.data) };
    res.json(body);
  });

  return router;
}
