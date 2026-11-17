import { z } from "zod";
import type { AccountType } from "./accounts.ts";

/**
 * What the desk page shows about the Member at the desk, and the token of the
 * desk session that serves them (ADR 0008). These types sit here, apart from
 * the Digital ID, Loans and Fines that each build on them, so none of those
 * files has to import another.
 */

/** A desk session's token, as `POST /desk/members/identify` gave it: 32 random bytes, base64url. */
export const deskSessionTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

/** A Member's Loans against their Loan Policy limit. */
export interface LoanStanding {
  current: number;
  /** The Loan Policy limit of the Member's Account Type. Zero means the Account Type cannot borrow. */
  limit: number;
  /** The Loan Policy loan period, or null for an Account Type that cannot borrow. */
  loanPeriodDays: number | null;
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

/** What the desk page shows about the Member whose Digital ID was scanned. */
export interface DeskMember {
  id: string;
  /** First, middle and last name. */
  fullName: string;
  accountType: AccountType;
  loans: LoanStanding;
  /** The Member's Fines that were fixed at a return and not yet settled, the earliest return first. Each can be settled here. */
  unsettledFines: DeskFine[];
}
