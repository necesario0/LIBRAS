import { PASSWORD_RESET_MESSAGES } from "@libras/shared";
import type { PasswordResetRequestedResponse } from "@libras/shared";
import type { AppDeps } from "../app.ts";
import { createAuditLog } from "../audit/index.ts";
import { withTransaction } from "../db.ts";
import { AppError } from "../errors.ts";
import { passwordChangedEmail, passwordResetCodeEmail } from "./password-emails.ts";
import { CODE_LIFETIME_MS, MAX_FAILED_ATTEMPTS, codeMatches, issueCode } from "./verification-code.ts";

type ResetDeps = Pick<AppDeps, "db" | "accounts" | "clock" | "email" | "logger">;

/** How long an expired row is kept before a later code request clears it. */
const EXPIRED_ROW_KEPT_MS = 24 * 60 * 60 * 1000;

const errors = {
  invalidCode: () => new AppError(400, "invalid_code", PASSWORD_RESET_MESSAGES.invalidCode),
  codeExpired: () => new AppError(400, "code_expired", PASSWORD_RESET_MESSAGES.codeExpired),
  tooManyWrongCodes: () => new AppError(429, "too_many_attempts", PASSWORD_RESET_MESSAGES.tooManyWrongCodes),
  resetUnfinished: (cause: unknown) =>
    new AppError(
      503,
      "password_reset_unfinished",
      "Your password could not be changed just now. Please try again in a moment.",
      { cause },
    ),
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

/** The Member the code is for, and the hash it matched, so the code can be spent only if it is still the current one. */
interface MatchedCode {
  userId: string;
  codeHash: string;
}

/**
 * Checks a code against the current one for the email. A wrong guess is
 * counted, and after `MAX_FAILED_ATTEMPTS` the code stops working. An email
 * with no Member has a row without a code, so every guess is wrong and counted
 * in the same way. The count is committed before the refusal is thrown.
 */
async function matchCode(deps: ResetDeps, email: string, code: string): Promise<MatchedCode> {
  const now = deps.clock.now();
  const outcome = await withTransaction(deps.db, async (client): Promise<MatchedCode | { refusal: AppError }> => {
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
    return { userId: row.user_id, codeHash: row.code_hash };
  });
  if ("refusal" in outcome) throw outcome.refusal;
  return outcome;
}

/** Checks the code before the app asks for the new password. The code stays usable. */
export async function checkPasswordResetCode(deps: ResetDeps, email: string, code: string): Promise<void> {
  await matchCode(deps, email, code);
}

/**
 * Sets the new password with a correct code. Supabase Auth ends every session
 * of the account when an administrator sets its password, so whoever was
 * signed in is signed out, and the Member is not signed in either: they sign
 * in with the new password. Then the code is spent, the reset is written to
 * the audit log and the Member is told by email.
 *
 * Nothing outside the database is called while a transaction is open. If
 * setting the password fails, the code still works and the Member tries again.
 */
export async function completePasswordReset(
  deps: ResetDeps,
  request: { email: string; code: string; password: string; clientAddress: string | undefined },
): Promise<void> {
  const { email, code, password } = request;
  const matched = await matchCode(deps, email, code);

  try {
    await deps.accounts.setPassword(matched.userId, password);
  } catch (error) {
    throw errors.resetUnfinished(error);
  }

  const audit = createAuditLog(deps);
  await withTransaction(deps.db, async (client) => {
    // Spend the code, unless a newer one replaced it meanwhile: that one stays usable.
    await client.query("delete from public.password_resets where email = $1 and code_hash = $2", [email, matched.codeHash]);
    await audit.record(
      {
        type: "password_reset",
        actorId: matched.userId,
        subject: matched.userId,
        data: { clientAddress: request.clientAddress?.slice(0, 64) ?? null },
      },
      client,
    );
  });

  try {
    await deps.email.send({ to: email, ...passwordChangedEmail("reset", deps.clock.now()) });
  } catch (error) {
    // The password is changed either way; the Member already knows, having just done it.
    deps.logger.error("The password changed email could not be sent", error);
  }
}
