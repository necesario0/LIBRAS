import { PASSWORD_CHANGE_MESSAGES } from "@libras/shared";
import type { MemberProfile } from "@libras/shared";
import type { AppDeps } from "../app.ts";
import { createAuditLog } from "../audit/index.ts";
import { notSignedIn } from "../auth/guards.ts";
import { AppError } from "../errors.ts";
import { passwordChangedEmail } from "./password-emails.ts";

type ChangeDeps = Pick<AppDeps, "db" | "auth" | "clock" | "email" | "logger">;

/** A signed-in Member asking to change their password. */
export interface PasswordChangeRequest {
  member: MemberProfile;
  /** The access token of the session making the change: the one that stays signed in. */
  accessToken: string;
  currentPassword: string;
  newPassword: string;
  clientAddress: string | undefined;
}

/**
 * A wrong current password is a 403, not a 401: the app treats a 401 as "your
 * session is gone" and signs the Member out, and the session here is fine. 403
 * is also a refusal the sign-in limiter counts.
 */
export function currentPasswordIncorrect(): AppError {
  return new AppError(403, "current_password_incorrect", PASSWORD_CHANGE_MESSAGES.currentPasswordIncorrect);
}

/**
 * Writes a Change password event to the audit log (the Member is actor and
 * subject; the address is kept, a password never is). A failed write is
 * logged and swallowed: for a wrong password the Member still gets the real
 * refusal, and for a change that already happened the Member still gets the
 * success, because a broken audit write must not undo or hide what was done.
 */
async function recordAudit(
  deps: ChangeDeps,
  type: "password_changed" | "password_change_failed",
  { member, clientAddress }: PasswordChangeRequest,
): Promise<void> {
  try {
    await createAuditLog(deps).record({
      type,
      actorId: member.id,
      subject: member.id,
      data: { clientAddress: clientAddress?.slice(0, 64) ?? null },
    });
  } catch (error) {
    deps.logger.error(`Could not record ${type} in the audit log`, error);
  }
}

/**
 * Checks the current password, by signing in with it at Supabase Auth. That
 * makes a session of its own, which is ended again at once (the change would
 * end it anyway, as one of the other sessions).
 *
 * Throws 403 `current_password_incorrect` for a wrong one and records it in
 * the audit log. The route puts this, and only this, behind the sign-in
 * limiter, which counts 401 and 403 refusals.
 */
export async function verifyCurrentPassword(deps: ChangeDeps, request: PasswordChangeRequest): Promise<void> {
  const signedIn = await deps.auth.signInWithPassword(request.member.email, request.currentPassword);
  if (signedIn === undefined) {
    await recordAudit(deps, "password_change_failed", request);
    throw currentPasswordIncorrect();
  }
  if (signedIn === "unverified") throw new Error("A signed-in Member's email is not verified");
  await deps.auth.signOut(signedIn.session.accessToken);
}

/**
 * Sets the new password, after `verifyCurrentPassword`. Supabase Auth sets it
 * with the Member's own access token, which ends every other session of the
 * account and keeps this one. Then the change is written to the audit log and
 * the Member is told by email.
 *
 * Throws 400 `invalid_password` when the new password is the current one, and
 * 401 `not_signed_in` when the session ended meanwhile. Nothing outside the
 * database is called while a transaction is open. Once the password is
 * changed nothing can fail the request: the audit write and the email are each
 * tried, and a failure of either is only logged.
 */
export async function changeMemberPassword(deps: ChangeDeps, request: PasswordChangeRequest): Promise<void> {
  if (request.newPassword === request.currentPassword) {
    throw new AppError(400, "invalid_password", PASSWORD_CHANGE_MESSAGES.samePassword);
  }
  if (!(await deps.auth.changePassword(request.accessToken, request.newPassword))) throw notSignedIn();

  await recordAudit(deps, "password_changed", request);
  try {
    await deps.email.send({ to: request.member.email, ...passwordChangedEmail("changed", deps.clock.now()) });
  } catch (error) {
    deps.logger.error("The password changed email could not be sent", error);
  }
}
