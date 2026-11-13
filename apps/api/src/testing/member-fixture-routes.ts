import { randomUUID } from "node:crypto";
import type { Router } from "express";
import type { AppDeps } from "../app.ts";

/**
 * A route that lets an end-to-end test on another process make a Visitor or
 * Alumni Member without going through the sign-up screens and the verification email. It writes
 * what verifying a sign-up would write, details included. It exists only
 * on the end-to-end server (`e2e-server.ts`): the real server never imports this module.
 *
 *   POST /e2e/members { accountType: "visitor" | "alumni" } -> 201 { email, password, firstName }
 */
export function memberFixtureRoutes(router: Router, deps: AppDeps): void {
  router.post("/e2e/members", async (req, res) => {
    const accountType: unknown = (req.body as { accountType?: unknown } | undefined)?.accountType;
    if (accountType !== "visitor" && accountType !== "alumni") {
      res.status(400).json({ error: { code: "invalid_request", message: "Not a Member fixture." } });
      return;
    }
    const unique = randomUUID();
    const email = `e2e-${unique}@example.com`;
    const password = `e2e-password-${unique}`;
    const userId = await deps.accounts.createUnverifiedAccount(email, password);
    if (userId === undefined) {
      res.status(409).json({ error: { code: "email_taken", message: "That email has an account." } });
      return;
    }
    await deps.accounts.confirmEmail(userId);
    const details =
      accountType === "visitor"
        ? { validIdNumber: "39458-3940-380", idType: "Passport", institution: "FEU (Far Eastern University)" }
        : { yearGraduated: "2025-2026", alumniIdNumber: "1234567" };
    const now = deps.clock.now();
    await deps.db.query(
      `insert into public.members (user_id, account_type, first_name, last_name, username, contact_number, details, terms_accepted_at, created_at)
       values ($1, $2, 'Cobby', $3, $4, '09034984958', $5, $6, $6)`,
      [userId, accountType, accountType === "visitor" ? "Visitor" : "Alumni", `e2e_${unique.slice(0, 8)}`, details, now],
    );
    res.status(201).json({ email, password, firstName: "Cobby" });
  });
}
