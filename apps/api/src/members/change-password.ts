import { PASSWORD_CHANGE_MESSAGES } from "@libras/shared";
import type { MemberProfile } from "@libras/shared";
import type { AppDeps } from "../app.ts";
import { notSignedIn } from "../auth/guards.ts";
import { AppError } from "../errors.ts";
import { recordPasswordEvent } from "./password-audit.ts";
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

const errors = {
  /**
   * A wrong current password is a 403, not a 401: the app treats a 401 as "your
   * session is gone" and signs the Member out, and the session here is fine. 403
   * is also a refusal the sign-in limiter counts.
   */
  currentPasswordIncorrect: () => new AppError(403, "current_password_incorrect", PASSWORD_CHANGE_MESSAGES.currentPasswordIncorrect),
  samePassword: () => new AppError(400, "invalid_password", PASSWORD_CHANGE_MESSAGES.samePassword),
};

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
    await recordPasswordEvent(deps, { type: "password_change_failed", memberId: request.member.id, clientAddress: request.clientAddress });
    throw errors.currentPasswordIncorrect();
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
 * database is called while a transaction is open. Once Supabase Auth has the
 * new password the request reports success, as Forgot password does: the audit
 * write (`recordPasswordEvent`) and the email are each tried, and a failure of
 * either is only logged.
 */
export async function changeMemberPassword(deps: ChangeDeps, request: PasswordChangeRequest): Promise<void> {
  if (request.newPassword === request.currentPassword) throw errors.samePassword();
  if (!(await deps.auth.changePassword(request.accessToken, request.newPassword))) throw notSignedIn();

  await recordPasswordEvent(deps, { type: "password_changed", memberId: request.member.id, clientAddress: request.clientAddress });
  try {
    await deps.email.send({ to: request.member.email, ...passwordChangedEmail("changed", deps.clock.now()) });
  } catch (error) {
    deps.logger.error("The password changed email could not be sent", error);
  }
}
