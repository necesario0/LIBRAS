import { formatLibraryDateTime } from "@libras/shared";

/**
 * "Your account was deleted": sent to the address the account had, once it is
 * gone, so a Member notices a deletion they did not make.
 */
export function accountDeletedEmail(at: Date): { subject: string; text: string } {
  const when = `${formatLibraryDateTime(at.toISOString())} (Philippine time)`;
  return {
    subject: "Your LIBRAS account was deleted",
    text:
      `Your LIBRAS account was deleted in the app on ${when}. ` +
      "Your profile, Saved books and sign-in are gone, your Holds were cancelled, and every device was signed out.\n\n" +
      "The library keeps your past Loans and Fines in its records, without your name or email.\n\n" +
      "You can sign up again with this email at any time. If you did not delete your account, tell the library.",
  };
}
