import { z } from "zod";
import { formatPesos } from "./fines.ts";
import { counted } from "./plural.ts";
import { totalOwedCentavos } from "./standing.ts";
import type { Clearance } from "./standing.ts";

/**
 * Delete my account (ADR 0011). Only a cleared Member can delete their account,
 * and they confirm with their current password. Their Loans and Fines stay in
 * the library's records, on a Member record with no personal data.
 */

/**
 * The body of `POST /members/me/delete`. The password is not held to the
 * sign-up rules: it is whatever the Member set, and is only compared with the real one.
 */
export const deleteAccountSchema = z.strictObject({
  password: z.string().min(1).max(1024),
});
export type DeleteAccountRequest = z.infer<typeof deleteAccountSchema>;

export const ACCOUNT_DELETION_MESSAGES = {
  passwordIncorrect: "That password is incorrect.",
  /** A request with no password, or one that is not text. */
  invalidRequest: "Enter your password to confirm.",
} as const;

/** What the app says when the Member is not cleared, and the API's refusal (`409 not_cleared`) says the same. */
export interface NotClearedNotice {
  title: string;
  message: string;
}

/** "A", "A and B", "A, B and C". */
function listed(items: readonly string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1) ?? ""}`;
}

/**
 * Why a Member who is not cleared cannot delete their account yet: every Loan
 * still out by its Book, and what they owe in unsettled Fines. The title names
 * the first thing to do: return the books, or settle the Fines.
 */
export function notClearedNotice(clearance: Pick<Clearance, "loansOut" | "unsettledFines">): NotClearedNotice {
  const { loansOut, unsettledFines } = clearance;
  const parts = ["You can delete your account once you are cleared."];
  if (loansOut.length > 0) {
    parts.push(`You still have ${counted(loansOut.length, "Loan")} out: ${listed(loansOut.map((loan) => loan.bookTitle))}.`);
  }
  if (unsettledFines.length > 0) {
    const owed = formatPesos(totalOwedCentavos({ unsettledFines }));
    const fines = unsettledFines.length === 1 ? `an unsettled Fine of ${owed}` : `${counted(unsettledFines.length, "unsettled Fine")}, ${owed} in all`;
    parts.push(`${loansOut.length > 0 ? "You also have" : "You still have"} ${fines}. Settle ${unsettledFines.length === 1 ? "it" : "them"} at the library desk.`);
  }
  return {
    title: loansOut.length > 0 ? "Return your books first" : "Settle your Fines first",
    message: parts.join(" "),
  };
}
