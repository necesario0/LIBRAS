import { PASSWORD_CHANGE_MESSAGES } from "@libras/shared";
import type { AppDeps } from "../app.ts";
import { createAuditLog } from "../audit/index.ts";
import { notSignedIn } from "../auth/guards.ts";
import { AppError } from "../errors.ts";
import { passwordChangedEmail } from "./password-emails.ts";

type ChangeDeps = Pick<AppDeps, "db" | "auth" | "clock" | "email" | "logger">;

export interface PasswordChange {
  /** The access token of the session making the change: the one that stays signed in. */
  accessToken: string;
  memberId: string;
  email: string;
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
 * Writes a wrong current password to the audit log. If the entry cannot be
 * written the failure is logged and the Member still gets the real refusal: a
 * broken audit write must not turn a wrong password into a server error.
 */
async function recordWrongCurrentPassword(deps: ChangeDeps, change: PasswordChange): Promise<void> {
  try {
    await createAuditLog(deps).record({
      type: "password_change_failed",
      actorId: change.memberId,
      subject: change.memberId,
      data: { clientAddress: change.clientAddress?.slice(0, 64) ?? null },
    });
  } catch (error) {
    deps.logger.error("Could not record a wrong current password in the audit log", error);
  }
}

/**
 * Changes a signed-in Member's password. The current password is checked
 * first, by signing in with it at Supabase Auth: that makes a session of its
 * own, which is ended again at once (the change would end it anyway, as one of
 * the other sessions). Then Supabase Auth sets the new password with the
 * Member's own access token, which ends every other session of the account and
 * keeps this one. Last, the change is written to the audit log and the Member
 * is told by email.
 *
 * Throws 403 `current_password_incorrect` for a wrong current password (the
 * route puts this behind the sign-in limiter and records the failure), and 400
 * `invalid_password` when the new password is the current one.
 *
 * Nothing outside the database is called while a transaction is open. If the
 * email cannot be sent the change stands and the failure is logged.
 */
export async function changeMemberPassword(deps: ChangeDeps, change: PasswordChange): Promise<void> {
  const { auth } = deps;

  const signedIn = await auth.signInWithPassword(change.email, change.currentPassword);
  if (signedIn === undefined) {
    await recordWrongCurrentPassword(deps, change);
    throw currentPasswordIncorrect();
  }
  if (signedIn === "unverified") throw new Error("A signed-in Member's email is not verified");
  await auth.signOut(signedIn.session.accessToken);

  if (change.newPassword === change.currentPassword) {
    throw new AppError(400, "invalid_password", PASSWORD_CHANGE_MESSAGES.samePassword);
  }
  if (!(await auth.changePassword(change.accessToken, change.newPassword))) throw notSignedIn();

  await createAuditLog(deps).record({
    type: "password_changed",
    actorId: change.memberId,
    subject: change.memberId,
    data: { clientAddress: change.clientAddress?.slice(0, 64) ?? null },
  });

  try {
    await deps.email.send({ to: change.email, ...passwordChangedEmail("changed", deps.clock.now()) });
  } catch (error) {
    // The password is changed either way; the Member already knows, having just done it.
    deps.logger.error("The password changed email could not be sent", error);
  }
}
