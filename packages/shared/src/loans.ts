import { z } from "zod";
import { digitalIdCodeSchema } from "./digital-id.ts";
import type { DeskMember } from "./digital-id.ts";
import { SCAN_INPUT_PATTERN } from "./scan.ts";

/**
 * Loans: a Loan links one Member to one Copy, with a checkout time, a due date
 * and a return time. Only a Librarian confirming it at the desk creates one.
 */

/**
 * The library's time zone as a fixed offset from UTC: Philippine Standard Time,
 * which has no daylight saving. Due dates and the dates a Member reads are days
 * of the library's calendar, wherever the phone or the server is.
 */
export const LIBRARY_UTC_OFFSET_HOURS = 8;

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

/** "Nov 19, 2026, 4:05 PM": the library's calendar day and time of day of an ISO 8601 time. */
export function formatLibraryDateTime(iso: string): string {
  const shifted = new Date(Date.parse(iso) + OFFSET_MS);
  const hours = shifted.getUTCHours();
  const minutes = String(shifted.getUTCMinutes()).padStart(2, "0");
  return `${formatLibraryDate(iso)}, ${hours % 12 === 0 ? 12 : hours % 12}:${minutes} ${hours < 12 ? "AM" : "PM"}`;
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
  /** The Loan Policy loan period in days, or null for an Account Type that cannot borrow. */
  loanPeriodDays: number | null;
}

/** A Copy as the desk names it: its barcode or its accession number, already through the scan whitelist. */
export const copyCodeSchema = z.string().regex(SCAN_INPUT_PATTERN);

/** The body of `POST /desk/loans`: the Member's Digital ID as scanned, and the Copy's barcode or accession number. */
export const confirmLoanRequestSchema = z.object({ digitalId: digitalIdCodeSchema, copy: copyCodeSchema }).strict();
export type ConfirmLoanRequest = z.infer<typeof confirmLoanRequestSchema>;

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
    "This Digital ID was already used at another desk. Ask the Member to wait for the next code on their screen and scan that one.",
  copyNotFound: "No Copy has this barcode or accession number. Scan it again, or type the accession number printed on the Copy.",
  cannotBorrow: "This Member's Account Type cannot borrow, so no Loan was recorded. They may use the Copy inside the library.",
  limitReached: "This Member is at their loan limit, so no Loan was recorded. A Copy must be returned before they borrow another.",
  copyOnLoan:
    "This Copy is already on Loan, so no Loan was recorded. If it has come back, choose Done with this Member and scan it again to record its return.",
  copySetAside: "This Copy is set aside for another Member's Hold, so no Loan was recorded. Put it back on the hold shelf.",
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
  /** The Copy came back after the end of its due day. Tier 1 charges nothing for it. */
  late: boolean;
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
