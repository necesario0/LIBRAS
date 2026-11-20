import { z } from "zod";
import type { AccountType } from "./accounts.ts";
import { deskSessionTokenSchema } from "./desk.ts";
import type { DeskMember } from "./desk.ts";
import type { LoanFine } from "./fines.ts";
import { LIBRARY_HOURS_SUMMARY, LIBRARY_UTC_OFFSET_HOURS } from "./library-hours.ts";
import { SCAN_INPUT_PATTERN } from "./scan.ts";
import { GOOD_STANDING_REFUSALS } from "./standing.ts";
import type { GoodStandingRefusal } from "./standing.ts";

/**
 * Loans: a Loan links one Member to one Copy, with a checkout time, a due date
 * and a return time. Only a Librarian confirming it at the desk creates one.
 */

export { LIBRARY_UTC_OFFSET_HOURS };

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const OFFSET_MS = LIBRARY_UTC_OFFSET_HOURS * HOUR_MS;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/**
 * When a Loan confirmed at `checkedOutAt` is due: the last millisecond of the
 * library day that is `loanPeriodDays` days after the checkout day. A Copy lent
 * at any time on 12 Nov for 7 days is due on 19 Nov and is overdue from 20 Nov.
 */
export function loanDueAt(checkedOutAt: Date, loanPeriodDays: number): Date {
  const libraryDay = Math.floor((checkedOutAt.getTime() + OFFSET_MS) / DAY_MS);
  return new Date((libraryDay + loanPeriodDays + 1) * DAY_MS - OFFSET_MS - 1);
}

/** Whether a Loan that is still out has passed its due date. */
export function isLoanOverdue(dueAt: Date, now: Date): boolean {
  return now.getTime() > dueAt.getTime();
}

/** "Nov 19": the library's calendar day of an ISO 8601 time, without the year. */
export function formatLibraryDay(iso: string): string {
  const shifted = new Date(Date.parse(iso) + OFFSET_MS);
  return `${MONTHS[shifted.getUTCMonth()]} ${shifted.getUTCDate()}`;
}

/** "Nov 19, 2026": the library's calendar day of an ISO 8601 time, written as the designs write dates. */
export function formatLibraryDate(iso: string): string {
  const shifted = new Date(Date.parse(iso) + OFFSET_MS);
  return `${formatLibraryDay(iso)}, ${shifted.getUTCFullYear()}`;
}

/** "4:05 PM": the time of day in the library's time zone on a 12-hour clock. */
export function formatLibraryTime(iso: string): string {
  const shifted = new Date(Date.parse(iso) + OFFSET_MS);
  const hours = shifted.getUTCHours();
  const minutes = String(shifted.getUTCMinutes()).padStart(2, "0");
  return `${hours % 12 === 0 ? 12 : hours % 12}:${minutes} ${hours < 12 ? "AM" : "PM"}`;
}

/** "Nov 19, 2026, 4:05 PM": the library's calendar day and time of day of an ISO 8601 time. */
export function formatLibraryDateTime(iso: string): string {
  return `${formatLibraryDate(iso)}, ${formatLibraryTime(iso)}`;
}

/**
 * True when a Loan's due timestamp is a specific closing hour (same-day in-library
 * Loans) rather than the `23:59:59.999` end of day used by multi-day take-home Loans.
 */
export function hasExactDueTime(dueAtIso: string): boolean {
  const shifted = new Date(Date.parse(dueAtIso) + OFFSET_MS);
  return !(shifted.getUTCHours() === 23 && shifted.getUTCMinutes() === 59);
}

/** Formats a Loan's due timestamp with its closing hour for in-library Loans or date only for multi-day Loans. */
export function formatLoanDueAt(dueAtIso: string): string {
  return hasExactDueTime(dueAtIso) ? formatLibraryDateTime(dueAtIso) : formatLibraryDate(dueAtIso);
}

/** Whole library days from the day of `fromIso` to the day of `toIso`: 7 from a checkout on Nov 12 to a due date of Nov 19. */
export function libraryDaysBetween(fromIso: string, toIso: string): number {
  const day = (iso: string) => Math.floor((Date.parse(iso) + OFFSET_MS) / DAY_MS);
  return day(toIso) - day(fromIso);
}

/** One of the Member's Loans. */
export interface Loan {
  id: string;
  bookId: string;
  bookTitle: string;
  /** One entry per author, "Surname, Given". */
  bookAuthors: string[];
  /** The accession number of the Copy that is out. */
  accessionNumber: string;
  /** When the Librarian confirmed the Loan, ISO 8601, by the API's clock. */
  checkedOutAt: string;
  /** The end of the day the Copy is due, ISO 8601. */
  dueAt: string;
  /** When the Copy came back, or null while it is still out. */
  returnedAt: string | null;
  /** Still out and past its due date, by the API's clock when it answered. */
  overdue: boolean;
  /** How many times the Member has renewed this Loan. `dueAt` is already the due date after them. */
  renewalCount: number;
  /** Whether a Renewal is possible now, by the API's rules and clock. Null for a Loan whose Copy has been returned. */
  renewal: LoanRenewal | null;
  /**
   * The Fine: so far (by the API's clock and the current Loan Policy) while the
   * Loan is out and overdue, or the amount fixed at a late return. Null for a
   * Loan that is not overdue or came back on time.
   */
  fine: LoanFine | null;
}

/**
 * Why the API refuses a Renewal, in the order it checks them: the Loan is past
 * its due date, it has used the renewal limit of the Member's Loan Policy,
 * another Member's Hold on the Book is waiting (a ready Hold does not block),
 * or the Member is not in Good standing, named by its reason
 * (`GOOD_STANDING_REFUSALS`): another of their Loans is overdue
 * (`overdue_loan`; when it is this Loan, `loan_overdue` comes first) or they
 * have an unsettled Fine.
 */
export const RENEWAL_REFUSALS = ["loan_overdue", "not_renewable", "renewal_limit_reached", "hold_waiting", ...GOOD_STANDING_REFUSALS] as const;
export type RenewalRefusal = (typeof RENEWAL_REFUSALS)[number];

/**
 * Whether a current Loan can be renewed now. When it can: the due date the
 * Renewal would give (one loan period after the current due date), and whether
 * that Renewal would use up the renewal limit (`last`). When it cannot: the
 * reason. The API works this out; the app only shows it.
 */
export type LoanRenewal = { renewable: true; dueAt: string; last: boolean } | { renewable: false; reason: RenewalRefusal };

/** What My Loans shows in place of the Renew button of a Loan that cannot be renewed. */
export const RENEWAL_REASONS: Readonly<Record<RenewalRefusal, string>> = {
  loan_overdue: "Overdue Loans cannot be renewed. Please return it to the library desk.",
  not_renewable: "In-library Loans cannot be renewed. Please return it before closing.",
  renewal_limit_reached: "Already renewed. It cannot be renewed again.",
  hold_waiting: "Another Member is waiting for this Book, so it cannot be renewed.",
  overdue_loan: "You have another Loan that is overdue. Renewals can be made again once it is returned and its Fine is settled.",
  unsettled_fine: "You have an unsettled Fine. Renewals can be made again once it is settled at the library desk.",
};

/** The words the API returns and the app shows when a Renewal is refused. */
export const RENEWAL_MESSAGES = {
  /** For a Loan id that is not one at all, and for one that is not the Member's: the same words, so neither says more. */
  loanNotFound: "This Loan could not be found. Open My Loans and try again.",
  loanReturned: "This Copy has been returned, so there is no Loan to renew.",
  /** A refusal of the Renewal itself. The Loans list said it could be renewed, so something changed since. */
  refused: {
    loan_overdue: "Your Loan was not renewed: it is now past its due date. Please return the Copy to the library desk.",
    not_renewable: "Your Loan was not renewed: in-library Loans cannot be renewed. Please return the Copy before closing.",
    renewal_limit_reached: "Your Loan was not renewed: it has already been renewed, and it cannot be renewed again.",
    hold_waiting: "Your Loan was not renewed: another Member is now waiting for this Book. Please return the Copy by its due date.",
    // Good standing: the same words My Loans shows for the Loan (`RENEWAL_REASONS`).
    overdue_loan: RENEWAL_REASONS.overdue_loan,
    unsettled_fine: RENEWAL_REASONS.unsettled_fine,
  } satisfies Record<RenewalRefusal, string>,
} as const;

/** A Loan's id, as `POST /loans/:id/renew` takes it. */
export const loanIdSchema = z.uuid(RENEWAL_MESSAGES.loanNotFound);

/** The body of `POST /loans/:id/renew`: the renewed Loan, with its new due date. */
export interface RenewLoanResponse {
  loan: Loan;
}

/** A Loan is current until its Copy is returned. */
export function isCurrentLoan(loan: Pick<Loan, "returnedAt">): boolean {
  return loan.returnedAt === null;
}

/**
 * The body of `GET /members/me/loans`: every Loan of the Member. Current Loans
 * come first, the one due soonest at the top; past Loans follow, the latest
 * return first.
 */
export interface MyLoansResponse {
  loans: Loan[];
  /** The Loan Policy limit of the Member's Account Type: how many Copies they may have out at once. Zero means they cannot borrow. */
  loanLimit: number;
  /** The Loan Policy loan period in days, or null for in-library-only / non-borrowing Account Types. */
  loanPeriodDays: number | null;
  /** True when Copies may only be borrowed for same-day in-library use within library hours. */
  inLibraryOnly: boolean;
}

/**
 * `GET /members/me/loan-policy`: the Loan Policy of the signed-in Member's
 * Account Type, as the library has set it. Help and policies words it for the
 * Member. A `loanLimit` of zero means the Account Type cannot borrow; when
 * `inLibraryOnly` is true, Copies may only be borrowed for same-day use inside the library.
 */
export interface MemberLoanPolicyResponse {
  accountType: AccountType;
  loanLimit: number;
  loanPeriodDays: number | null;
  inLibraryOnly: boolean;
  /** How many times one Loan may be renewed. */
  renewalLimit: number;
  /** The Fine for each day a Loan is late, in centavos. */
  fineDailyRateCentavos: number;
  /** The most one Loan's Fine can reach, in centavos. */
  fineCapCentavos: number;
}

/** A Copy as the desk names it: its barcode or its accession number, already through the scan whitelist. */
export const copyCodeSchema = z.string().regex(SCAN_INPUT_PATTERN);

/** The body of `POST /desk/loans`: the desk session of the Member at the desk, and the Copy's barcode or accession number. */
export const confirmLoanRequestSchema = z.object({ deskSession: deskSessionTokenSchema, copy: copyCodeSchema }).strict();
export type ConfirmLoanRequest = z.infer<typeof confirmLoanRequestSchema>;

/** The body of `POST /desk/sessions/end`: "Done with this Member". */
export const endDeskSessionRequestSchema = z.object({ deskSession: deskSessionTokenSchema }).strict();
export type EndDeskSessionRequest = z.infer<typeof endDeskSessionRequestSchema>;

/** What the desk page shows about a Loan it has just confirmed. */
export interface DeskLoan {
  id: string;
  bookTitle: string;
  accessionNumber: string;
  checkedOutAt: string;
  dueAt: string;
}

/** The body of `POST /desk/loans`: the new Loan, and the Member with the Loan counted. */
export interface ConfirmLoanResponse {
  loan: DeskLoan;
  member: DeskMember;
}

/** The words the API returns and the desk page shows when a Loan cannot be confirmed. */
export const LOAN_MESSAGES = {
  invalidRequest: "Scan the Member's Digital ID, then the Copy's barcode. If a barcode cannot be read, type the accession number.",
  digitalIdUsed:
    "This Digital ID was already scanned at another desk. Ask the Member to wait for the next code on their screen and scan that one.",
  deskSessionEnded:
    "This Member's visit to the desk has timed out or ended, so no Loan was recorded. Ask the Member to show their Digital ID again and scan it, then scan the Copy.",
  copyNotFound: "No Copy has this barcode or accession number. Scan it again, or type the accession number printed on the Copy.",
  cannotBorrow: "This Member's Account Type cannot borrow, so no Loan was recorded. They may use the Copy inside the library.",
  libraryClosed: `The library is closed right now, so an in-library Loan cannot be recorded. In-library Loans are available during library hours (${LIBRARY_HOURS_SUMMARY}).`,
  limitReached: "This Member is at their loan limit, so no Loan was recorded. A Copy must be returned before they borrow another.",
  copyOnLoan:
    "This Copy is already on Loan, so no Loan was recorded. If it has come back, choose Done with this Member and scan it again to record its return.",
  copySetAside: "This Copy is set aside for another Member's Hold, so no Loan was recorded. Put it back on the hold shelf.",
  changed: "This Copy's Hold changed while the Loan was being recorded, so no Loan was recorded. Scan the Copy again.",
  /** The Member is not in Good standing (ADR 0010). The refusal's code is the reason. */
  notInGoodStanding: {
    overdue_loan:
      "This Member has an overdue Loan, so no Loan was recorded. They can borrow again once it is returned and its Fine is settled.",
    unsettled_fine: "This Member has an unsettled Fine, so no Loan was recorded. Settle it in the Member panel, then scan the Copy again.",
  } satisfies Record<GoodStandingRefusal, string>,
} as const;

/** The body of `POST /desk/returns`: the Copy's barcode or accession number, as scanned or typed. */
export const recordReturnRequestSchema = z.object({ copy: copyCodeSchema }).strict();
export type RecordReturnRequest = z.infer<typeof recordReturnRequestSchema>;

/** What the desk page shows about a return it has just recorded. */
export interface ReturnedLoan {
  /** The id of the Loan that was closed. */
  id: string;
  bookTitle: string;
  accessionNumber: string;
  /** Who had the Copy out. */
  memberName: string;
  checkedOutAt: string;
  dueAt: string;
  /** When the return was recorded, ISO 8601, by the API's clock. */
  returnedAt: string;
  /** The Copy came back after the end of its due day. */
  late: boolean;
  /** The Fine fixed by this return (`final` is true), or null when the Copy came back on time or the rate is zero. */
  fine: LoanFine | null;
  /**
   * The Member whose Hold the returned Copy is now set aside for, and the end of
   * their Pickup Window: the Copy goes on the hold shelf. Null when no Hold was
   * waiting: the Copy is available and goes back on the stacks.
   */
  heldFor: { memberName: string; pickupEndsAt: string } | null;
}

/** The body of `POST /desk/returns`. */
export interface RecordReturnResponse {
  loan: ReturnedLoan;
}

/** The words the API returns and the desk page shows when a return cannot be recorded. */
export const RETURN_MESSAGES = {
  invalidRequest: "Scan the Copy's barcode to record its return. If a barcode cannot be read, type the accession number.",
  copyNotFound: "No Copy has this barcode or accession number. Scan it again, or type the accession number printed on the Copy.",
  copyNotOnLoan:
    "This Copy is not on Loan, so no return was recorded. It may already have been returned. Check that you scanned the right Copy.",
  changedHands: "This Copy changed hands while its return was being recorded, so nothing was recorded. Scan it again.",
} as const;
