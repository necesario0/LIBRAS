import type { Router } from "express";
import type { AppDeps } from "../app.ts";
import { recordLoanNotifications } from "../notices/notifications.ts";

/**
 * A route that lets an end-to-end test on another process give a Member the
 * Notification the Loan notice job records for one of their Loans, without
 * waiting for 08:00 library time (the end-to-end server runs on the real
 * clock). It records it the way the sweep does, through the same function,
 * with the Loan's real title and due date: `dueTomorrow` as with the email the
 * day before the due date, `overdue` as with the email on the first overdue day.
 * It exists only on the end-to-end server (`e2e-server.ts`): the real server
 * never imports this module.
 *
 *   POST /e2e/notifications/loan { email, bookId, notice: "dueTomorrow" | "overdue" } -> 201 { loanId }
 */
export function notificationFixtureRoutes(router: Router, deps: AppDeps): void {
  router.post("/e2e/notifications/loan", async (req, res) => {
    const { email, bookId, notice } = (req.body ?? {}) as { email?: unknown; bookId?: unknown; notice?: unknown };
    if (typeof email !== "string" || typeof bookId !== "string" || (notice !== "dueTomorrow" && notice !== "overdue")) {
      res.status(400).json({ error: { code: "invalid_request", message: "Not a Loan Notification fixture." } });
      return;
    }
    const { rows } = await deps.db.query<{ id: string; member_id: string; title: string; due_at: Date }>(
      `select l.id, l.member_id, b.title, l.due_at
         from public.loans l
         join public.copies c on c.id = l.copy_id
         join public.books b on b.id = c.book_id
         join auth.users u on u.id = l.member_id
        where lower(u.email) = lower($1) and c.book_id = $2 and l.returned_at is null
        order by l.checked_out_at desc
        limit 1`,
      [email, bookId],
    );
    const loan = rows[0];
    if (loan === undefined) {
      res.status(404).json({ error: { code: "not_found", message: "The Member has no open Loan of a Copy of that Book." } });
      return;
    }
    await recordLoanNotifications(deps, loan.member_id, [
      {
        id: loan.id,
        title: loan.title,
        dueAt: loan.due_at,
        slot: { kind: notice === "dueTomorrow" ? "due_tomorrow" : "now_overdue", repeat: 0 },
      },
    ]);
    res.status(201).json({ loanId: loan.id });
  });
}
