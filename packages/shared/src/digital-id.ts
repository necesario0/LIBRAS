import { z } from "zod";
import type { AccountType } from "./accounts.ts";

/**
 * The Digital ID: 12 digits, drawn as a Code 128 subset C barcode (ADR 0004).
 *
 *   NNNNNN TTTTTT
 *   |      `- token: 6 digits derived from the Member's secret and the current 60-second window
 *   `- Digital ID number: 6 digits, fixed and unique per Member, so a code names exactly one Member
 *
 * Only the API knows the secret; the app asks the API for the current code.
 */
export const DIGITAL_ID_WINDOW_SECONDS = 60;
export const DIGITAL_ID_NUMBER_DIGITS = 6;
export const DIGITAL_ID_TOKEN_DIGITS = 6;
export const DIGITAL_ID_LENGTH = DIGITAL_ID_NUMBER_DIGITS + DIGITAL_ID_TOKEN_DIGITS;

/** A Digital ID in its canonical form: exactly 12 ASCII digits. */
export const digitalIdCodeSchema = z.string().regex(/^[0-9]{12}$/);

/** The body of `POST /desk/members/identify`. */
export const identifyMemberRequestSchema = z.object({ code: digitalIdCodeSchema }).strict();
export type IdentifyMemberRequest = z.infer<typeof identifyMemberRequestSchema>;

/** The digits grouped in fours ("4821 0937 5512"): how the app prints the code beneath the barcode. */
export function formatDigitalId(code: string): string {
  return code.replace(/(\d{4})(?=\d)/g, "$1 ");
}

/** The body of `GET /members/me/digital-id`. */
export interface DigitalIdResponse {
  /** The current code, 12 digits. */
  code: string;
  /** When this code's window started, ISO 8601, by the API's clock. */
  windowStartsAt: string;
  /** When the next code replaces this one, ISO 8601, by the API's clock. The desk still accepts this code for one more window. */
  refreshAt: string;
  /** The API's clock when it answered, ISO 8601. The app times its refresh from this, not from the phone's own clock. */
  serverTime: string;
}

/** A Member's Loans against their Loan Policy limit. */
export interface LoanStanding {
  current: number;
  /** The Loan Policy limit of the Member's Account Type. Zero means the Account Type cannot borrow. */
  limit: number;
  /** The Loan Policy loan period, or null for an Account Type that cannot borrow. */
  loanPeriodDays: number | null;
}

/** What the desk page shows about the Member whose Digital ID was scanned. */
export interface DeskMember {
  id: string;
  /** First, middle and last name. */
  fullName: string;
  accountType: AccountType;
  loans: LoanStanding;
}

/** The body of `POST /desk/members/identify`. */
export interface IdentifyMemberResponse {
  member: DeskMember;
}

/** The wording both the API and the desk page use for a refused Digital ID. */
export const DIGITAL_ID_MESSAGES = {
  expired: "This Digital ID has expired. Ask the Member to show the code on their screen now.",
  invalid: "This is not a valid Digital ID. Ask the Member to show their Digital ID again, or type the code beneath it.",
} as const;
