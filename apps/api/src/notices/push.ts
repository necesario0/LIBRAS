import { formatLibraryDate } from "@libras/shared";
import { pushEvents } from "../push/index.ts";
import type { PushContent, PushDeps, PushEvent } from "../push/index.ts";
import { dueWhen } from "./email.ts";
import type { LoanNoticeSlot } from "./schedule.ts";

/** A Loan whose notice the Member was just emailed. */
export interface NotifiedLoan {
  id: string;
  title: string;
  dueAt: Date;
  slot: LoanNoticeSlot;
}

/** `"A"`, `"A" and "B"`, `"A", "B" and "C"`. */
function titles(loans: readonly NotifiedLoan[]): string {
  const quoted = loans.map((loan) => `"${loan.title}"`);
  return quoted.length <= 1 ? quoted.join("") : `${quoted.slice(0, -1).join(", ")} and ${quoted.at(-1) ?? ""}`;
}

/** The push about Loans due tomorrow (or today, for a notice the one-email-a-day rule held back). */
export function dueTomorrowPush(loans: readonly NotifiedLoan[], now: Date): PushContent {
  const when = new Set(loans.map((loan) => dueWhen(loan, now)));
  const day = when.size === 1 ? [...when][0] : "soon";
  const [only] = loans;
  if (loans.length === 1 && only) {
    return { title: `Your Loan is due ${day}`, body: `${titles(loans)} is due ${day}, ${formatLibraryDate(only.dueAt.toISOString())}.` };
  }
  return { title: `Your Loans are due ${day}`, body: `${titles(loans)} are due ${day}.` };
}

/** The push about Loans on their first overdue day. */
export function nowOverduePush(loans: readonly NotifiedLoan[]): PushContent {
  const [only] = loans;
  if (loans.length === 1 && only) {
    return {
      title: "Your Loan is overdue",
      body: `${titles(loans)} was due on ${formatLibraryDate(only.dueAt.toISOString())}. Please return it to the library desk.`,
    };
  }
  return { title: "Your Loans are overdue", body: `${titles(loans)} are overdue. Please return them to the library desk.` };
}

/** One push event per Loan and due date: a Renewal gives the Loan a new due date, and so new pushes. */
const occasionOf = (loan: NotifiedLoan) => `${loan.id}:${loan.dueAt.toISOString()}`;

/**
 * Pushes, alongside a Loan notice email that just went out, one notification
 * about its Loans due tomorrow and one about its Loans now overdue, to a Member
 * who has that kind switched on. The weekly still-overdue notices are emails
 * only. A Loan's push for a due date goes once, however many emails mention it.
 * Never throws.
 */
export async function pushLoanNotices(deps: PushDeps, memberId: string, loans: readonly NotifiedLoan[]): Promise<void> {
  const now = deps.clock.now();
  const push = (kind: "loanDueTomorrow" | "loanOverdue", of: readonly NotifiedLoan[], words: (claimed: readonly NotifiedLoan[]) => PushContent) =>
    pushEvents(
      deps,
      kind,
      of.map((loan) => ({ memberId, occasion: occasionOf(loan) })),
      (claimed: readonly PushEvent[]) => words(of.filter((loan) => claimed.some((event) => event.occasion === occasionOf(loan)))),
    );

  await push(
    "loanDueTomorrow",
    loans.filter((loan) => loan.slot.kind === "due_tomorrow"),
    (due) => dueTomorrowPush(due, now),
  );
  await push(
    "loanOverdue",
    loans.filter((loan) => loan.slot.kind === "now_overdue"),
    nowOverduePush,
  );
}
