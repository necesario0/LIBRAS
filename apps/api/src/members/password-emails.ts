import { formatLibraryDateTime } from "@libras/shared";
import { CODE_LIFETIME_MS } from "./verification-code.ts";

/** The Forgot password email: the code that lets the Member set a new password. */
export function passwordResetCodeEmail(code: string): { subject: string; text: string } {
  const minutes = CODE_LIFETIME_MS / 60_000;
  return {
    subject: "Your LIBRAS password reset code",
    text:
      `Your LIBRAS password reset code is ${code}\n\n` +
      `Enter it in the app to set a new password. It works for ${minutes} minutes.\n\n` +
      "If you did not ask to reset your password, you can ignore this email. Your password stays the same.",
  };
}

/** How the password was changed: with an emailed code (Forgot password), or by the signed-in Member (Change password). */
export type PasswordChange = "reset" | "changed";

/**
 * "Your password was changed": sent after every reset and every change, so a
 * Member notices a change they did not make.
 */
export function passwordChangedEmail(how: PasswordChange, at: Date): { subject: string; text: string } {
  const when = `${formatLibraryDateTime(at.toISOString())} (Philippine time)`;
  const what =
    how === "reset"
      ? `The password of your LIBRAS account was reset with an emailed code on ${when}. Every device that was signed in to your account has been signed out.`
      : `The password of your LIBRAS account was changed in the app on ${when}. Every other device that was signed in to your account has been signed out.`;
  return {
    subject: "Your LIBRAS password was changed",
    text:
      `${what}\n\n` +
      "If you made this change, you do not need to do anything.\n\n" +
      'If you did not, reset your password at once with "Forgot password?" on the sign-in screen of the LIBRAS app, and tell the library.',
  };
}
