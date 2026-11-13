import { createHash, randomBytes } from "node:crypto";
import { DESK_SESSION_MINUTES, LOAN_MESSAGES } from "@libras/shared";
import type { DeskSession } from "@libras/shared";
import type { AppDeps } from "../app.ts";
import { withTransaction } from "../db.ts";
import type { Tx } from "../db.ts";
import { verifyDigitalId } from "../digital-id/index.ts";
import type { VerifiedDigitalId } from "../digital-id/index.ts";
import { AppError } from "../errors.ts";

/**
 * Desk sessions (ADR 0008). Scanning a Member's Digital ID at the desk starts a
 * session for that Librarian and that Member; each Copy scanned for the Member
 * names the session instead of the Digital ID, which changes every 60 seconds
 * and would have expired by the time a slow scan of the Copy arrives. A session
 * lasts `DESK_SESSION_MINUTES` after it starts or was last used, and "Done with
 * this Member" ends it at once.
 *
 * The token is 32 random bytes; only its SHA-256 hash is stored. A token that
 * is unknown, expired, ended or another Librarian's is refused the same way
 * (`409 desk_session_ended`), so the answer tells nothing about other sessions.
 */

type Deps = Pick<AppDeps, "db" | "clock">;

const SESSION_MS = DESK_SESSION_MINUTES * 60_000;

function hashOf(token: string): Buffer {
  return createHash("sha256").update(token).digest();
}

function sessionEnded(): AppError {
  return new AppError(409, "desk_session_ended", LOAN_MESSAGES.deskSessionEnded);
}

/**
 * Claims the shown Digital ID code for this Librarian's desk (ADR 0004: a
 * Member and a window name one shown code). The Librarian who first scans a
 * code may scan it again while it is still accepted; the same code at any other
 * desk is refused, so a copy of a Member's screen cannot start a session elsewhere.
 */
async function claimDigitalId(tx: Tx, verified: VerifiedDigitalId, librarianId: string, at: Date): Promise<void> {
  await tx.query(
    `insert into public.digital_id_uses (member_id, code_window, librarian_id, first_used_at)
     values ($1, $2, $3, $4)
     on conflict (member_id, code_window) do nothing`,
    [verified.memberId, verified.window, librarianId, at],
  );
  const { rows } = await tx.query<{ librarian_id: string }>(
    "select librarian_id from public.digital_id_uses where member_id = $1 and code_window = $2",
    [verified.memberId, verified.window],
  );
  if (rows[0]?.librarian_id !== librarianId) throw new AppError(409, "digital_id_used", LOAN_MESSAGES.digitalIdUsed);
}

/**
 * The Librarian scanned a Digital ID: checks it (`verifyDigitalId`: 400
 * `digital_id_expired` or `digital_id_invalid`), claims it for this desk (409
 * `digital_id_used` when another Librarian scanned it first) and starts a desk
 * session for its Member. Sessions that are over are cleared out on the way.
 */
export async function startDeskSession(
  deps: Deps,
  librarianId: string,
  code: string,
): Promise<{ memberId: string; deskSession: DeskSession }> {
  const verified = await verifyDigitalId(deps, code);
  const now = deps.clock.now();
  const expiresAt = new Date(now.getTime() + SESSION_MS);
  const token = randomBytes(32).toString("base64url");
  await withTransaction(deps.db, async (tx) => {
    await claimDigitalId(tx, verified, librarianId, now);
    await tx.query("delete from public.desk_sessions where expires_at <= $1 or ended_at is not null", [now]);
    await tx.query(
      `insert into public.desk_sessions (token_hash, librarian_id, member_id, started_at, expires_at)
       values ($1, $2, $3, $4, $5)`,
      [hashOf(token), librarianId, verified.memberId, now, expiresAt],
    );
  });
  return { memberId: verified.memberId, deskSession: { token, expiresAt: expiresAt.toISOString() } };
}

/**
 * The Member of this Librarian's desk session, for a Copy scanned now. The
 * session is renewed: it now ends `DESK_SESSION_MINUTES` from now. Throws 409
 * `desk_session_ended` for a token that is unknown, expired, ended or not this
 * Librarian's: the Member's Digital ID must be scanned again.
 */
export async function useDeskSession(deps: Deps, librarianId: string, token: string): Promise<string> {
  const now = deps.clock.now();
  const { rows } = await deps.db.query<{ member_id: string }>(
    `update public.desk_sessions set expires_at = $4
      where token_hash = $1 and librarian_id = $2 and ended_at is null and expires_at > $3
      returning member_id`,
    [hashOf(token), librarianId, now, new Date(now.getTime() + SESSION_MS)],
  );
  const memberId = rows[0]?.member_id;
  if (memberId === undefined) throw sessionEnded();
  return memberId;
}

/** "Done with this Member": ends the session at once. Does nothing for a token that is not a live session of this Librarian's. */
export async function endDeskSession(deps: Deps, librarianId: string, token: string): Promise<void> {
  await deps.db.query(
    "update public.desk_sessions set ended_at = $3 where token_hash = $1 and librarian_id = $2 and ended_at is null",
    [hashOf(token), librarianId, deps.clock.now()],
  );
}
