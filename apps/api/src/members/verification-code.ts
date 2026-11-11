import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

export const CODE_LENGTH = 6;
/** How long an emailed code works. */
export const CODE_LIFETIME_MS = 10 * 60 * 1000;
/** Wrong guesses allowed against one code. The code stops working after that and a new one must be requested. */
export const MAX_FAILED_ATTEMPTS = 5;
/** The shortest wait between two emails to the same address. */
export const RESEND_COOLDOWN_MS = 30 * 1000;

export interface IssuedCode {
  /** What goes in the email. Never stored. */
  code: string;
  /** What is stored, to check the code later. */
  salt: string;
  hash: string;
}

function hashCode(code: string, salt: string): string {
  return createHash("sha256").update(`${salt}:${code}`).digest("hex");
}

/** A new random code of `CODE_LENGTH` digits, with the salted hash to store. */
export function issueCode(): IssuedCode {
  const code = String(randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, "0");
  const salt = randomBytes(16).toString("hex");
  return { code, salt, hash: hashCode(code, salt) };
}

export function codeMatches(code: string, salt: string, hash: string): boolean {
  const actual = Buffer.from(hashCode(code, salt), "hex");
  const expected = Buffer.from(hash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function verificationEmail(code: string): { subject: string; text: string } {
  const minutes = CODE_LIFETIME_MS / 60_000;
  return {
    subject: "Your LIBRAS verification code",
    text:
      `Your LIBRAS verification code is ${code}\n\n` +
      `Enter it in the app to finish creating your account. It works for ${minutes} minutes.\n\n` +
      "If you did not sign up for LIBRAS, you can ignore this email.",
  };
}
