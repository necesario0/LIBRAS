import { RENEWAL_REASONS, formatLibraryDate, formatPesos } from "@libras/shared";
import type { LoanRenewal } from "@libras/shared";
import type { EmailMessage } from "../email.ts";
import type { FineRate } from "../fines/index.ts";
import { libraryDayOf } from "./schedule.ts";
import type { LoanNoticeSlot } from "./schedule.ts";

/** One Loan in a notice email, and the notice it gets. */
export interface NoticeLoan {
  slot: LoanNoticeSlot;
  title: string;
  accessionNumber: string;
  dueAt: Date;
  /** Whether the Loan can be renewed now (`renewalOf`): for a due-tomorrow notice only, null otherwise. */
  renewal: LoanRenewal | null;
  /** The Member's daily Fine rate and Fine cap, in centavos: for a due-tomorrow notice, null otherwise or when nothing would be owed. */
  fineRate: FineRate | null;
  /** The Fine so far, in centavos (`fineAt`, as My Loans shows it): for an overdue notice, null otherwise. */
  fineSoFar: number | null;
}

export interface LoanNoticeEmail {
  firstName: string;
  /** Every Loan with a notice in this email. */
  loans: readonly NoticeLoan[];
  /** When the email goes out. */
  now: Date;
}

const isOverdue = (loan: NoticeLoan) => loan.slot.kind !== "due_tomorrow";

/** "tomorrow" or "today": a due-tomorrow notice held back by the one-email-a-day rule goes out on the due day. */
function dueWhen(loan: NoticeLoan, now: Date): string {
  return libraryDayOf(loan.dueAt) > libraryDayOf(now) ? "tomorrow" : "today";
}

function subjectOf({ loans, now }: LoanNoticeEmail): string {
  const overdue = loans.filter(isOverdue);
  if (overdue.length > 0) return overdue.length === 1 ? "You have an overdue LIBRAS Loan" : "You have overdue LIBRAS Loans";
  const when = new Set(loans.map((loan) => dueWhen(loan, now)));
  const day = when.size === 1 ? [...when][0] : "soon";
  return loans.length === 1 ? `Your LIBRAS Loan is due ${day}` : `Your LIBRAS Loans are due ${day}`;
}

/** The lines about one Loan. */
function paragraphOf(loan: NoticeLoan, now: Date): string {
  const copy = `"${loan.title}" (Copy ${loan.accessionNumber})`;
  const due = formatLibraryDate(loan.dueAt.toISOString());
  if (loan.slot.kind === "due_tomorrow") {
    const renewal = loan.renewal;
    const renew =
      renewal === null
        ? ""
        : renewal.renewable
          ? `You can renew it in the LIBRAS app, under My Loans, until then: the new due date would be ${formatLibraryDate(renewal.dueAt)}.`
          : `It cannot be renewed: ${RENEWAL_REASONS[renewal.reason]} Please return it to the library desk by then.`;
    const rate =
      loan.fineRate === null
        ? ""
        : `\nIf it is returned late, the Fine is ${formatPesos(loan.fineRate.dailyRateCentavos)} a day, up to ${formatPesos(loan.fineRate.capCentavos)}.`;
    return `${copy} is due ${dueWhen(loan, now)}, ${due}.\n${renew}${rate}`;
  }
  const days = libraryDayOf(now) - libraryDayOf(loan.dueAt);
  const late = loan.slot.kind === "now_overdue" ? "is overdue" : "is still overdue";
  const fine = loan.fineSoFar === null ? "" : `\nThe Fine so far is ${formatPesos(loan.fineSoFar)}.`;
  return `${copy} ${late}: it was due on ${due}, ${days} ${days === 1 ? "day" : "days"} ago.${fine}\nPlease return it to the library desk.`;
}

/**
 * The one email of a library day that covers every Loan notice a Member has
 * due (ADR 0009): overdue Loans first, the longest overdue at the top, then the
 * Loans due tomorrow.
 */
export function loanNoticeEmail(notice: LoanNoticeEmail): Pick<EmailMessage, "subject" | "text"> {
  const ordered = [...notice.loans.filter(isOverdue), ...notice.loans.filter((loan) => !isOverdue(loan))];
  return {
    subject: subjectOf(notice),
    text:
      `Hi ${notice.firstName},\n\n` +
      `${ordered.map((loan) => paragraphOf(loan, notice.now)).join("\n\n")}\n\n` +
      "LIBRAS emails you the day before a Loan is due, on its first overdue day, and every week while it stays overdue.",
  };
}
