import { z } from "zod";
import type { DeskMember } from "./digital-id.ts";
import { deskSessionTokenSchema } from "./loans.ts";

/**
 * Fines (ADR 0010): the peso amount a Member owes for one Loan returned late.
 * Amounts are whole centavos everywhere (500 = PHP 5), so no amount is ever a
 * fraction. The API works every Fine out; the app and the desk page only show it.
 */

/** How a Librarian settled a Fine: the Member paid it at the desk, or the Librarian waived it. LIBRAS records which, not the money. */
export const FINE_OUTCOMES = ["paid", "waived"] as const;
export type FineOutcome = (typeof FINE_OUTCOMES)[number];

/** What a Member reads of a settled Fine: how it was settled and when. Who settled it is for the audit log. */
export interface FineSettlement {
  outcome: FineOutcome;
  /** When the Librarian settled it, ISO 8601, by the API's clock. */
  settledAt: string;
}

/** The Fine of one Loan: the Fine so far while the Loan is out and overdue, or the final amount fixed at its return. */
export interface LoanFine {
  /** What the Member owes, in centavos: the daily rate for every day late, up to the cap. */
  amountCentavos: number;
  /** Calendar days after the due date, the day of the return (or today) included. */
  daysLate: number;
  /** The daily Fine rate it was worked out with, in centavos. */
  dailyRateCentavos: number;
  /** The Fine cap it was worked out with, in centavos. */
  capCentavos: number;
  /** True once the Copy is returned: the amount is fixed for good. False while it still grows (the Fine so far). */
  final: boolean;
  /** How it was settled, or null while it is unsettled. Always null while the Loan is out: only a fixed Fine can be settled. */
  settlement: FineSettlement | null;
}

/** "PHP 15", "PHP 2.50", "PHP 1,234,567": an amount in centavos as LIBRAS writes it. */
export function formatPesos(centavos: number): string {
  const pesos = Math.floor(centavos / 100);
  const rest = centavos % 100;
  const whole = pesos.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return rest === 0 ? `PHP ${whole}` : `PHP ${whole}.${String(rest).padStart(2, "0")}`;
}

/** A Fine that has been fixed and not yet settled, as the desk's Member panel lists it. */
export interface DeskFine {
  /** The id of the Loan the Fine is on, which names the Fine. */
  loanId: string;
  bookTitle: string;
  accessionNumber: string;
  /** What the Member owes, in centavos. */
  amountCentavos: number;
  /** Calendar days after the due date, the day of the return included. */
  daysLate: number;
  /** When the Copy came back and the Fine was fixed, ISO 8601. */
  returnedAt: string;
}

/** How long after a late return its Librarian may still settle the Fine on that return, in minutes. Later, the Member's desk session is the place. */
export const SETTLE_AT_RETURN_MINUTES = 10;

/**
 * The body of `POST /desk/fines/settle`. A Fine is settled in one of two places,
 * and the request says which: on the return of the late Copy (by the Librarian
 * who recorded it, soon after), or in the desk session of the Fine's Member.
 */
export const settleFineRequestSchema = z.discriminatedUnion("place", [
  z.object({ place: z.literal("return"), loan: z.uuid(), outcome: z.enum(FINE_OUTCOMES) }).strict(),
  z.object({ place: z.literal("desk_session"), deskSession: deskSessionTokenSchema, loan: z.uuid(), outcome: z.enum(FINE_OUTCOMES) }).strict(),
]);
export type SettleFineRequest = z.infer<typeof settleFineRequestSchema>;

/** The body of `POST /desk/fines/settle`: the settlement, and the Fine's Member as the desk now shows them (their unsettled Fines without this one). */
export interface SettleFineResponse {
  loanId: string;
  settlement: FineSettlement;
  member: DeskMember;
}

/** The words the API returns and the desk page shows when a Fine cannot be settled. */
export const FINE_MESSAGES = {
  invalidRequest: "Choose Paid or Waived to settle this Fine.",
  notFound:
    "No unsettled Fine of this return or this Member's visit matches, so nothing was settled. Check the Fine on the screen, or scan the Member's Digital ID to see their Fines.",
  alreadySettled: "This Fine was already settled, so nothing changed. A settled Fine cannot be settled again.",
  returnSettleEnded:
    "This return was recorded a while ago, so the Fine can no longer be settled from it. Scan the Member's Digital ID and settle it from their Fines.",
} as const;
