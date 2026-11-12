import { z } from "zod";
import { AppError } from "../errors.ts";
import type { Logger } from "../logger.ts";
import type { AuditLog } from "./audit-log.ts";

const KNOWN_REASONS = new Set(["invalid_credentials", "email_not_verified", "not_member", "not_staff"] as const);
type Reason = "invalid_credentials" | "email_not_verified" | "not_member" | "not_staff" | "refused";

const emailShape = z.email();

export interface SignInAttempt {
  portal: "member" | "staff";
  /** What was typed in the email field, as the request sent it. */
  email: string;
  /** The client address, as the sign-in limiter sees it. */
  clientAddress: string | undefined;
}

/**
 * Runs a sign-in and records it in the audit log when it is refused (a 401 or
 * 403, the same refusals the sign-in limiter counts). The password is never
 * passed here. The email is recorded only when it looks like an email: people
 * sometimes type their password into the email field, and that must not end
 * up in the log.
 *
 * If the entry cannot be written, the failure is logged and the person still
 * gets the original refusal: a broken audit write must not turn a wrong
 * password into a server error.
 */
export async function recordingSignInFailures<T>(
  { audit, logger }: { audit: AuditLog; logger: Logger },
  attempt: SignInAttempt,
  signIn: () => Promise<T>,
): Promise<T> {
  try {
    return await signIn();
  } catch (error) {
    if (error instanceof AppError && (error.status === 401 || error.status === 403)) {
      const email = attempt.email.trim().toLowerCase();
      const reason: Reason = (KNOWN_REASONS as ReadonlySet<string>).has(error.code) ? (error.code as Reason) : "refused";
      try {
        await audit.record({
          type: "sign_in_failed",
          subject: emailShape.safeParse(email).success && email.length <= 320 ? email : null,
          data: { portal: attempt.portal, reason, clientAddress: attempt.clientAddress?.slice(0, 64) ?? null },
        });
      } catch (auditError) {
        logger.error("Could not record a failed sign-in in the audit log", auditError);
      }
    }
    throw error;
  }
}
