import type { MemberProfile, ParsedSignUpRequest, SignUpCodeSentResponse } from "@libras/shared";
import type pg from "pg";
import type { AppDeps } from "../app.ts";
import { AppError } from "../errors.ts";
import { withTransaction } from "../db.ts";
import { memberFromRow, MEMBER_COLUMNS } from "./profile.ts";
import type { MemberRow } from "./profile.ts";
import {
  CODE_LIFETIME_MS,
  MAX_FAILED_ATTEMPTS,
  RESEND_COOLDOWN_MS,
  codeMatches,
  issueCode,
  verificationEmail,
} from "./verification-code.ts";

type SignUpDeps = Pick<AppDeps, "db" | "accounts" | "clock" | "email" | "logger">;

/** What the person entered at sign-up, less the email, password and acceptance, which live elsewhere. */
type StoredProfile = Omit<ParsedSignUpRequest, "email" | "password" | "acceptedTerms">;

const PG_UNIQUE_VIOLATION = "23505";

const errors = {
  emailTaken: () => new AppError(409, "email_taken", "An account with this email already exists. Sign in instead."),
  usernameTaken: () => new AppError(409, "username_taken", "That username is already taken. Choose another one."),
  studentNumberTaken: () =>
    new AppError(
      409,
      "student_number_taken",
      "An account with this student number already exists. If it is yours, sign in instead.",
    ),
  noPendingSignUp: () =>
    new AppError(404, "no_pending_signup", "We could not find a sign-up for this email. Please start again."),
  tooSoon: (waitMs: number) =>
    new AppError(
      429,
      "code_requested_too_soon",
      `Please wait ${Math.ceil(waitMs / 1000)} seconds before asking for a new code.`,
    ),
  invalidCode: () => new AppError(400, "invalid_code", "That code is not right. Check your email and try again."),
  codeExpired: () => new AppError(400, "code_expired", "That code has expired. Ask for a new code."),
  tooManyWrongCodes: () =>
    new AppError(429, "too_many_attempts", "Too many wrong codes. Ask for a new code to try again."),
  emailUnavailable: (cause: unknown) =>
    new AppError(503, "email_unavailable", "We could not send the verification email. Please try again.", { cause }),
};

/** Sends the code. A failure here means the person never gets it, so it is an error they can retry. */
async function sendCode(deps: SignUpDeps, to: string, code: string): Promise<void> {
  try {
    await deps.email.send({ to, ...verificationEmail(code) });
  } catch (error) {
    throw errors.emailUnavailable(error);
  }
}

function codeSentResponse(email: string, sentAt: Date): SignUpCodeSentResponse {
  return {
    email,
    codeExpiresAt: new Date(sentAt.getTime() + CODE_LIFETIME_MS).toISOString(),
    resendAvailableAt: new Date(sentAt.getTime() + RESEND_COOLDOWN_MS).toISOString(),
  };
}

interface ExistingAccount {
  user_id: string;
  is_member: boolean;
  code_sent_at: Date | null;
}

/**
 * Starts a sign-up: checks the person is not registered yet, creates their
 * account with the email still unconfirmed (so it cannot sign in), stores the
 * rest of what they entered and emails a verification code. The Member does
 * not exist until `verifySignUp` accepts the code.
 */
export async function startSignUp(deps: SignUpDeps, request: ParsedSignUpRequest): Promise<SignUpCodeSentResponse> {
  const { db, accounts, clock } = deps;
  const now = clock.now();
  // Acceptance is stored as the time it was given, so the flag itself is dropped.
  const { email, password, acceptedTerms, ...profile } = request;
  void acceptedTerms;

  const taken = await db.query<{ username: boolean; student_number: boolean }>(
    `select
       exists (select 1 from public.members where lower(username) = lower($1)) as username,
       exists (select 1 from public.members where account_type = 'umak_student' and details ->> 'studentNumber' = $2) as student_number`,
    [profile.username, profile.details.studentNumber],
  );
  if (taken.rows[0]?.username) throw errors.usernameTaken();
  if (taken.rows[0]?.student_number) throw errors.studentNumberTaken();

  const existing = (
    await db.query<ExistingAccount>(
      `select u.id as user_id,
              exists (select 1 from public.members m where m.user_id = u.id) as is_member,
              s.code_sent_at
         from auth.users u
         left join public.signup_requests s on s.user_id = u.id
        where lower(u.email) = $1`,
      [email],
    )
  ).rows[0];

  let userId: string;
  if (existing === undefined) {
    const created = await accounts.createUnverifiedAccount(email, password);
    // Someone else signed up with this email at the same moment.
    if (created === undefined) throw errors.emailTaken();
    userId = created;
  } else if (existing.is_member || existing.code_sent_at === null) {
    // A registered Member, a Librarian, or any other account that is not waiting for a code.
    throw errors.emailTaken();
  } else {
    // An earlier sign-up with this email never finished. Whoever proves they own the
    // address wins, so this one replaces it, with the new password and details.
    const wait = existing.code_sent_at.getTime() + RESEND_COOLDOWN_MS - now.getTime();
    if (wait > 0) throw errors.tooSoon(wait);
    userId = existing.user_id;
    await accounts.setPassword(userId, password);
  }

  const issued = issueCode();
  await db.query(
    `insert into public.signup_requests
       (user_id, profile, terms_accepted_at, code_salt, code_hash, code_sent_at, code_expires_at, failed_attempts)
     values ($1, $2, $3, $4, $5, $6, $7, 0)
     on conflict (user_id) do update set
       profile = excluded.profile, terms_accepted_at = excluded.terms_accepted_at,
       code_salt = excluded.code_salt, code_hash = excluded.code_hash,
       code_sent_at = excluded.code_sent_at, code_expires_at = excluded.code_expires_at, failed_attempts = 0`,
    [userId, JSON.stringify(profile satisfies StoredProfile), now, issued.salt, issued.hash, now, new Date(now.getTime() + CODE_LIFETIME_MS)],
  );
  await sendCode(deps, email, issued.code);
  return codeSentResponse(email, now);
}

interface PendingRow {
  user_id: string;
  profile: StoredProfile;
  terms_accepted_at: Date;
  code_salt: string;
  code_hash: string;
  code_sent_at: Date;
  code_expires_at: Date;
  failed_attempts: number;
}

const PENDING_COLUMNS =
  "s.user_id, s.profile, s.terms_accepted_at, s.code_salt, s.code_hash, s.code_sent_at, s.code_expires_at, s.failed_attempts";

/** Locks the pending sign-up for this email, so two requests cannot act on it at once. */
async function lockPending(client: pg.PoolClient, email: string): Promise<PendingRow> {
  const found = await client.query<PendingRow>(
    `select ${PENDING_COLUMNS}
       from public.signup_requests s join auth.users u on u.id = s.user_id
      where lower(u.email) = $1
        for update of s`,
    [email],
  );
  const row = found.rows[0];
  if (!row) throw errors.noPendingSignUp();
  return row;
}

type VerifyOutcome = { member: MemberProfile } | { refusal: AppError };

/**
 * Accepts the emailed code. On success the Member is created and the account's
 * email is confirmed, so the account is active at once. A wrong guess is counted
 * and the code stops working after `MAX_FAILED_ATTEMPTS`.
 */
export async function verifySignUp(deps: SignUpDeps, email: string, code: string): Promise<MemberProfile> {
  const { db, accounts, clock } = deps;
  const now = clock.now();

  const outcome = await withTransaction(db, async (client): Promise<VerifyOutcome> => {
    const pending = await lockPending(client, email);

    if (pending.failed_attempts >= MAX_FAILED_ATTEMPTS) return { refusal: errors.tooManyWrongCodes() };
    if (now.getTime() >= pending.code_expires_at.getTime()) return { refusal: errors.codeExpired() };
    if (!codeMatches(code, pending.code_salt, pending.code_hash)) {
      await client.query("update public.signup_requests set failed_attempts = failed_attempts + 1 where user_id = $1", [
        pending.user_id,
      ]);
      return { refusal: errors.invalidCode() };
    }

    const { profile } = pending;
    let row: MemberRow | undefined;
    try {
      // A savepoint keeps the transaction usable when the insert hits a unique index.
      await client.query("savepoint create_member");
      row = (
        await client.query<MemberRow>(
          `insert into public.members
             (user_id, account_type, first_name, middle_name, last_name, username, contact_number, details, terms_accepted_at, created_at)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           returning ${MEMBER_COLUMNS}`,
          [
            pending.user_id,
            profile.accountType,
            profile.firstName,
            profile.middleName ?? null,
            profile.lastName,
            profile.username,
            profile.contactNumber ?? null,
            JSON.stringify(profile.details),
            pending.terms_accepted_at,
            now,
          ],
        )
      ).rows[0];
    } catch (error) {
      if (isUniqueViolation(error)) {
        await client.query("rollback to savepoint create_member");
        // Another Member took the username or student number while this person was verifying.
        return { refusal: error.constraint === "members_student_number_key" ? errors.studentNumberTaken() : errors.usernameTaken() };
      }
      throw error;
    }
    if (!row) throw new Error("Creating the Member returned no row");

    await client.query("delete from public.signup_requests where user_id = $1", [pending.user_id]);
    // Last, so a failure here rolls the Member back and the code can be tried again.
    await accounts.confirmEmail(pending.user_id);
    return { member: memberFromRow(row, email) };
  });

  if ("refusal" in outcome) throw outcome.refusal;
  return outcome.member;
}

function isUniqueViolation(error: unknown): error is { code: string; constraint?: string } {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === PG_UNIQUE_VIOLATION;
}

/** Emails a new code for a sign-up that is waiting for one. The old code stops working. */
export async function resendSignUpCode(deps: SignUpDeps, email: string): Promise<SignUpCodeSentResponse> {
  const { db, clock } = deps;
  const now = clock.now();
  const issued = issueCode();

  await withTransaction(db, async (client) => {
    const pending = await lockPending(client, email);
    const wait = pending.code_sent_at.getTime() + RESEND_COOLDOWN_MS - now.getTime();
    if (wait > 0) throw errors.tooSoon(wait);
    await client.query(
      `update public.signup_requests
          set code_salt = $2, code_hash = $3, code_sent_at = $4, code_expires_at = $5, failed_attempts = 0
        where user_id = $1`,
      [pending.user_id, issued.salt, issued.hash, now, new Date(now.getTime() + CODE_LIFETIME_MS)],
    );
  });
  await sendCode(deps, email, issued.code);
  return codeSentResponse(email, now);
}
