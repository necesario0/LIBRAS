import type { Router } from "express";
import type { CapturingEmailSender } from "./capturing-email-sender.ts";

/**
 * Routes that let an end-to-end test on another machine or process read the
 * emails the API "sent". They exist only on the end-to-end server
 * (`e2e-server.ts`): the real server never imports this module.
 *
 *   GET    /e2e/emails?to=<address>   -> { messages: [...] }, oldest first
 *   DELETE /e2e/emails                -> 204, forgets every captured message
 */
export function mailboxRoutes(emails: CapturingEmailSender): (router: Router) => void {
  return (router) => {
    router.get("/e2e/emails", (req, res) => {
      const to = typeof req.query.to === "string" ? req.query.to.trim().toLowerCase() : undefined;
      const messages = emails.sent.filter((message) => to === undefined || message.to.toLowerCase() === to);
      res.json({ messages });
    });
    router.delete("/e2e/emails", (_req, res) => {
      emails.clear();
      res.status(204).end();
    });
  };
}
