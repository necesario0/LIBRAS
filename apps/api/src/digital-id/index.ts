import { DIGITAL_ID_MESSAGES, DIGITAL_ID_NUMBER_DIGITS } from "@libras/shared";
import type { DigitalIdResponse } from "@libras/shared";
import type { Clock } from "../clock.ts";
import { isUniqueViolation } from "../db.ts";
import type { Database } from "../db.ts";
import { AppError } from "../errors.ts";
import { newIdNumber, newSecret, tokenFor, tokensEqual, windowOf, windowStart } from "./code.ts";

/**
 * The Digital ID (ADR 0004). A code is 12 digits: the Member's fixed 6-digit
 * Digital ID number, then a 6-digit token derived from the Member's secret and
 * the current 60-second window. The number makes the lookup unambiguous: a code
 * can only ever be checked against the one Member it names, and fails closed
 * when the token does not match. The secret is created here and never leaves the API.
 */

interface Deps {
  db: Database;
  clock: Clock;
}

interface SecretRow {
  member_id: string;
  id_number: string;
  secret: Buffer;
}

/** How many windows back a token is still recognised, to say "expired" rather than "not valid": one hour. */
const EXPIRED_LOOKBACK_WINDOWS = 60;
const MAX_NUMBER_ATTEMPTS = 20;

/** Stands in for a missing Member's secret, so an unknown number costs the same HMAC work as a known one. */
const NO_SECRET = Buffer.alloc(32);

/**
 * The Member's Digital ID number and secret, created on first use. Runs as the
 * API itself: no client role can read this table. A new random number that
 * collides with another Member's is drawn again.
 */
async function secretOf(db: Database, memberId: string): Promise<SecretRow> {
  for (let attempt = 0; attempt < MAX_NUMBER_ATTEMPTS; attempt += 1) {
    const existing = await db.query<SecretRow>(
      "select member_id, id_number, secret from public.digital_id_secrets where member_id = $1",
      [memberId],
    );
    if (existing.rows[0]) return existing.rows[0];
    try {
      await db.query(
        `insert into public.digital_id_secrets (member_id, id_number, secret) values ($1, $2, $3)
         on conflict (member_id) do nothing`,
        [memberId, newIdNumber(), newSecret()],
      );
    } catch (error) {
      if (!isUniqueViolation(error, "digital_id_secrets_id_number_key")) throw error;
    }
  }
  throw new Error("Could not find a free Digital ID number");
}

/** The Member's code for the current window, by the API's clock. */
export async function currentDigitalId({ db, clock }: Deps, memberId: string): Promise<DigitalIdResponse> {
  const { id_number, secret } = await secretOf(db, memberId);
  const now = clock.now();
  const window = windowOf(now);
  return {
    code: id_number + tokenFor(secret, window),
    windowStartsAt: windowStart(window).toISOString(),
    refreshAt: windowStart(window + 1).toISOString(),
    serverTime: now.toISOString(),
  };
}

/**
 * Who a verified Digital ID belongs to, and the window its code was made for.
 * The pair (memberId, window) names one shown code: the Loan ticket records it
 * when a Loan is confirmed and refuses the same pair again ("already used").
 */
export interface VerifiedDigitalId {
  memberId: string;
  window: number;
}

/**
 * Checks a canonical 12-digit code against the Member it names. Accepts the
 * current window and the one before it. Throws 400 `digital_id_expired` for a
 * code from up to an hour earlier and 400 `digital_id_invalid` for anything else,
 * including a number that belongs to nobody. The caller has already checked the
 * format (`digitalIdCodeSchema`).
 */
export async function verifyDigitalId({ db, clock }: Deps, code: string): Promise<VerifiedDigitalId> {
  const idNumber = code.slice(0, DIGITAL_ID_NUMBER_DIGITS);
  const token = code.slice(DIGITAL_ID_NUMBER_DIGITS);
  const { rows } = await db.query<SecretRow>(
    "select member_id, id_number, secret from public.digital_id_secrets where id_number = $1",
    [idNumber],
  );
  const row = rows[0];
  const secret = row?.secret ?? NO_SECRET;
  const now = windowOf(clock.now());

  // Both accepted windows are always computed and compared, so the response time
  // does not tell which one matched.
  const current = tokensEqual(tokenFor(secret, now), token);
  const previous = tokensEqual(tokenFor(secret, now - 1), token);
  if (row !== undefined && (current || previous)) {
    return { memberId: row.member_id, window: current ? now : now - 1 };
  }

  if (row !== undefined) {
    for (let window = now - 2; window >= now - EXPIRED_LOOKBACK_WINDOWS; window -= 1) {
      if (tokensEqual(tokenFor(secret, window), token)) {
        throw new AppError(400, "digital_id_expired", DIGITAL_ID_MESSAGES.expired);
      }
    }
  }
  throw new AppError(400, "digital_id_invalid", DIGITAL_ID_MESSAGES.invalid);
}
