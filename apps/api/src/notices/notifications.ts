import { recordNotifications } from "../notifications/index.ts";
import type { NewNotification, NotificationDeps } from "../notifications/index.ts";
import { dueTomorrowPush, nowOverduePush, occasionOf } from "./push.ts";
import type { NotifiedLoan } from "./push.ts";

/**
 * Records, alongside a Loan notice email that just went out, one Notification
 * for each Loan due tomorrow and each Loan on its first overdue day, whatever
 * the Member's push switches say. The weekly still-overdue notices are emails
 * only, as with push notifications. A Loan's Notification for a due date is
 * recorded once, however many emails mention it. Never throws.
 */
export async function recordLoanNotifications(deps: NotificationDeps, memberId: string, loans: readonly NotifiedLoan[]): Promise<void> {
  const now = deps.clock.now();
  const entry = (loan: NotifiedLoan, words: { title: string; body: string }): NewNotification => ({
    memberId,
    occasion: occasionOf(loan),
    ...words,
    about: { loanId: loan.id },
  });
  await recordNotifications(
    deps,
    "loanDueTomorrow",
    loans.filter((loan) => loan.slot.kind === "due_tomorrow").map((loan) => entry(loan, dueTomorrowPush([loan], now))),
  );
  await recordNotifications(
    deps,
    "loanOverdue",
    loans.filter((loan) => loan.slot.kind === "now_overdue").map((loan) => entry(loan, nowOverduePush([loan]))),
  );
}
