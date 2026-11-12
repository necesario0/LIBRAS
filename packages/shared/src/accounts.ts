import { z } from "zod";

/**
 * The five Account Types. A Member has exactly one, fixed at sign-up. The
 * values are what the API and the database store; `ACCOUNT_TYPE_LABELS` has
 * the words a person reads.
 */
export const ACCOUNT_TYPES = ["umak_student", "faculty", "ntp_employee", "visitor", "alumni"] as const;
export const accountTypeSchema = z.enum(ACCOUNT_TYPES);
export type AccountType = z.infer<typeof accountTypeSchema>;

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  umak_student: "UMAK Student",
  faculty: "Faculty",
  ntp_employee: "NTP / Employee",
  visitor: "Visitor",
  alumni: "Alumni",
};

/** The email domain of the University of Makati. */
export const UMAK_EMAIL_DOMAIN = "umak.edu.ph";

/** UMAK Student, Faculty and NTP / Employee must sign up with a university address. Visitor and Alumni may use any. */
export function requiresUmakEmail(accountType: AccountType): boolean {
  return accountType === "umak_student" || accountType === "faculty" || accountType === "ntp_employee";
}

/** True for `name@umak.edu.ph` only: a longer domain such as `umak.edu.ph.example.com` does not count. */
export function isUmakEmail(email: string): boolean {
  const at = email.lastIndexOf("@");
  return at > 0 && email.slice(at + 1).trim().toLowerCase() === UMAK_EMAIL_DOMAIN;
}

/**
 * Whether an Account Type may borrow. Visitor and Alumni may not (their Loan Policy limit is zero).
 *
 * SEAM: the Loan Policy rows (limit per Account Type) are the real source of this answer. Until the
 * app reads them, the app and the API derive "cannot borrow" from the Account Type here; when the
 * Loan Policy is exposed, replace the body with `loanLimit > 0` and keep the callers.
 */
export function canBorrow(accountType: AccountType): boolean {
  return accountType !== "visitor" && accountType !== "alumni";
}
