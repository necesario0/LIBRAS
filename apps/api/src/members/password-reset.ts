import { PASSWORD_RESET_MESSAGES } from "@libras/shared";
import type { PasswordResetRequestedResponse } from "@libras/shared";
import type { AppDeps } from "../app.ts";
import { withTransaction } from "../db.ts";
import { AppError } from "../errors.ts";
import { recordPasswordEvent } from "./password-audit.ts";
import { passwordChangedEmail, passwordResetCodeEmail } from "./password-emails.ts";
import { CODE_LIFETIME_MS, MAX_FAILED_ATTEMPTS, codeMatches, issueCode } from "./verification-code.ts";

type ResetDeps = Pick<AppDeps, "db" | "accounts" | "clock" | "email" | "logger">;

/** How long an expired row is kept before a later code request clears it. */
const EXPIRED_ROW_KEPT_MS = 24 * 60 * 60 * 1000;

const errors = {
  invalidCode: () => new AppError(400, "invalid_code", PASSWORD_RESET_MESSAGES.invalidCode),
  codeExpired: () => new AppError(400, "code_expired", PASSWORD_RESET_MESSAGES.codeExpired),
  tooManyWrongCodes: () => new AppError(429, "too_many_attempts", PASSWORD_RESET_MESSAGES.tooManyWrongCodes),
  resetUnfinished: (cause: unknown) => new AppError(503, "password_reset_unfinished", PASSWORD_RESET_MESSAGES.resetUnfinished, { cause }),
};

/**
 * Starts a Forgot password: emails a code to the address when it belongs to a
 * Member, and does the same visible work for any other address (a row with no
 * code, and no email), so the reply and every later reply about this email are
 * the same either way. A Librarian is not a Member: Librarian accounts are
 * managed by the seed script, so their email is treated as unknown.
 *
 * The email is sent without waiting for it: the reply must not take longer, or
 * fail, only when the address has an account. A failed send is logged and the
 * Member asks for a new code.
 */
export async function requestPasswordReset(deps: ResetDeps, email: string): Promise<PasswordResetRequestedResponse> {
  const { db, clock } = deps;
  const now = clock.now();
  const expiresAt = new Date(now.getTime() + CODE_LIFETIME_MS);

  await db.query("delete from public.password_resets where code_expires_at < $1", [
    new Date(now.getTime() - EXPIRED_ROW_KEPT_MS),
  ]);
  const member = await db.query<{ user_id: string }>(
    `select m.user_id
       from public.members m join auth.users u on u.id = m.user_id
      where lower(u.email) = $1
        and not exists (select 1 from public.staff s where s.user_id = m.user_id)`,
    [email],
  );
  const userId = member.rows[0]?.user_id;
  const issued = userId === undefined ? undefined : issueCode();

  // A new request replaces the code before it: the old one stops working and the wrong guesses start again.
  await db.query(
    `insert into public.password_resets (email, user_id, code_salt, code_hash, code_sent_at, code_expires_at, failed_attempts)
     values ($1, $2, $3, $4, $5, $6, 0)
     on conflict (email) do update set
       user_id = excluded.user_id, code_salt = excluded.code_salt, code_hash = excluded.code_hash,
       code_sent_at = excluded.code_sent_at, code_expires_at = excluded.code_expires_at, failed_attempts = 0`,
    [email, userId ?? null, issued?.salt ?? null, issued?.hash ?? null, now, expiresAt],
  );

  if (issued !== undefined) {
    deps.email.send({ to: email, ...passwordResetCodeEmail(issued.code) }).catch((error: unknown) => {
      deps.logger.error("A password reset code could not be emailed", error);
    });
  }
  return { email, codeExpiresAt: expiresAt.toISOString() };
}

interface ResetRow {
  user_id: string | null;
  code_salt: string | null;
  code_hash: string | null;
  code_expires_at: Date;
  failed_attempts: number;
}

/**
 * Checks a code against the current one for the email. A wrong guess is
 * counted, and after `MAX_FAILED_ATTEMPTS` the code stops working. An email
 * with no Member has a row without a code, so every guess is wrong and counted
 * in the same way. The count is committed before the refusal is thrown.
 *
 * With `spend`, a matching code is also spent (its row deleted) in the same
 * transaction, so it is committed before anything else happens: the code can
 * never be used twice, whatever fails afterwards. Returns the Member's id.
 */
async function matchCode(deps: ResetDeps, attempt: { email: string; code: string; spend: boolean }): Promise<string> {
  const { email, code } = attempt;
  const now = deps.clock.now();
  const outcome = await withTransaction(deps.db, async (client): Promise<{ userId: string } | { refusal: AppError }> => {
    const row = (
      await client.query<ResetRow>(
        `select user_id, code_salt, code_hash, code_expires_at, failed_attempts
           from public.password_resets where email = $1 for update`,
        [email],
      )
    ).rows[0];
    if (row === undefined) return { refusal: errors.invalidCode() };
    if (row.failed_attempts >= MAX_FAILED_ATTEMPTS) return { refusal: errors.tooManyWrongCodes() };
    if (now.getTime() >= row.code_expires_at.getTime()) return { refusal: errors.codeExpired() };
    if (row.user_id === null || row.code_salt === null || row.code_hash === null || !codeMatches(code, row.code_salt, row.code_hash)) {
      await client.query("update public.password_resets set failed_attempts = failed_attempts + 1 where email = $1", [email]);
      return { refusal: errors.invalidCode() };
    }
    if (attempt.spend) await client.query("delete from public.password_resets where email = $1", [email]);
    return { userId: row.user_id };
  });
  if ("refusal" in outcome) throw outcome.refusal;
  return outcome.userId;
}

/** Checks the code before the app asks for the new password. The code stays usable. */
export async function checkPasswordResetCode(deps: ResetDeps, email: string, code: string): Promise<void> {
  await matchCode(deps, { email, code, spend: false });
}

/**
 * Sets the new password with a correct code. The code is spent first, and that
 * is committed before Supabase Auth is asked, so it can never set a password
 * twice: if Supabase Auth then fails, the Member is told to ask for a new code
 * (503 `password_reset_unfinished`).
 *
 * Supabase Auth ends every session of the account when an administrator sets
 * its password, so whoever was signed in is signed out, and the Member is not
 * signed in either: they sign in with the new password. Once Supabase Auth has
 * the new password the reset reports success, as Change password does: the
 * audit write (`recordPasswordEvent`) and the "password changed" email are each
 * tried, and a failure of either is only logged.
 */
export async function completePasswordReset(
  deps: ResetDeps,
  request: { email: string; code: string; password: string; clientAddress: string | undefined },
): Promise<void> {
  const { email, code, password } = request;
  const userId = await matchCode(deps, { email, code, spend: true });

  try {
    await deps.accounts.setPassword(userId, password);
  } catch (error) {
    throw errors.resetUnfinished(error);
  }

  await recordPasswordEvent(deps, { type: "password_reset", memberId: userId, clientAddress: request.clientAddress });
  try {
    await deps.email.send({ to: email, ...passwordChangedEmail("reset", deps.clock.now()) });
  } catch (error) {
    // The password is changed either way; the Member already knows, having just done it.
    deps.logger.error("The password changed email could not be sent", error);
  }
}
