import { z } from "zod";
import { emailSchema, passwordSchema, verificationCodeSchema } from "./sign-up.ts";

/**
 * Forgot password: a Member asks for a code by email, enters it, then sets a
 * new password. The new password follows the sign-up rules (`passwordSchema`).
 */
export const PASSWORD_RESET_MESSAGES = {
  invalidCode: "That code is not right. Check your email and try again.",
  codeExpired: "That code has expired. Ask for a new code.",
  tooManyWrongCodes: "Too many wrong codes. Ask for a new code to try again.",
  /** Too many wrong codes for the email across codes: a new code does not help until the window passes. */
  tooManyWrongCodesForEmail: "Too many wrong codes for this email. Please wait and try again later.",
  /** Supabase Auth failed after the code was spent: the code cannot be used again. */
  resetUnfinished: "Your password could not be changed just now. Ask for a new code and try again.",
} as const;

/** The body of `POST /members/password-reset`: send a code to this email, if it belongs to a Member. */
export const requestPasswordResetSchema = z.object({ email: emailSchema });
export type RequestPasswordResetRequest = z.input<typeof requestPasswordResetSchema>;

/** The body of `POST /members/password-reset/check`: is this the code that was emailed? */
export const checkPasswordResetCodeSchema = z.object({
  email: emailSchema,
  code: verificationCodeSchema,
});
export type CheckPasswordResetCodeRequest = z.input<typeof checkPasswordResetCodeSchema>;

/** The body of `POST /members/password-reset/complete`: the code again, with the new password. */
export const completePasswordResetSchema = z.object({
  email: emailSchema,
  code: verificationCodeSchema,
  password: passwordSchema,
});
export type CompletePasswordResetRequest = z.input<typeof completePasswordResetSchema>;

/**
 * The body of `POST /members/password-reset`. The same for every email, whether
 * or not it has an account: nobody can use it to find out who is a Member.
 */
export interface PasswordResetRequestedResponse {
  email: string;
  /** When the code stops working, ISO 8601. */
  codeExpiresAt: string;
}
