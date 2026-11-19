import { ACCOUNT_DELETION_MESSAGES, notClearedNotice } from "@libras/shared";
import type { HoldStatus, MemberProfile } from "@libras/shared";
import type { AppDeps } from "../app.ts";
import { createAuditLog } from "../audit/index.ts";
import type { AuditEvent } from "../audit/index.ts";
import { lockCopy } from "../copies/index.ts";
import type { CopyRow } from "../copies/index.ts";
import { retryOnConflict, withTransaction } from "../db.ts";
import type { Tx } from "../db.ts";
import { AppError } from "../errors.ts";
import { announceDispatch, dispatchCopy } from "../holds/dispatch.ts";
import type { HoldDispatch } from "../holds/dispatch.ts";
import { expireDueHolds } from "../holds/expiry.ts";
import { lockMember } from "../loans/policy.ts";
import { forgetPushDevicesOf } from "../push/index.ts";
import { clearanceOf, readStanding } from "../standing/index.ts";
import { accountDeletedEmail } from "./account-emails.ts";
import { auditClientAddress, recordPasswordEvent } from "./password-audit.ts";
import { isCurrentPassword } from "./password-check.ts";

/** A signed-in Member asking to delete their account. */
export interface AccountDeletionRequest {
  member: MemberProfile;
  password: string;
  clientAddress: string | undefined;
}

/**
 * Checks the password the Member confirmed with (`isCurrentPassword`). Throws
 * 403 `password_incorrect` for a wrong one and records it in the audit log. The
 * route puts this, and only this, behind the sign-in limiter, which counts 401
 * and 403 refusals: a 403 also keeps the app from reading it as a session that ended.
 */
export async function verifyDeletionPassword(deps: AppDeps, request: AccountDeletionRequest): Promise<void> {
  if (await isCurrentPassword(deps, request.member, request.password)) return;
  await recordPasswordEvent(deps, { type: "account_deletion_failed", memberId: request.member.id, clientAddress: request.clientAddress });
  throw new AppError(403, "password_incorrect", ACCOUNT_DELETION_MESSAGES.passwordIncorrect);
}

/** Thrown inside the transaction when the Member's Holds changed between reading and locking them: start again. */
class HoldsChanged extends Error {}

/** How many times the deletion reads the Holds again when one changed while the transaction waited for its locks. */
const ATTEMPTS = 3;

interface ActiveHoldRow {
  id: string;
  status: HoldStatus;
  copy_id: string | null;
}

const ACTIVE_HOLDS_SQL = `
  select id, status, copy_id from public.holds
   where member_id = $1 and status in ('waiting', 'ready')
   order by id`;

const sameHolds = (seen: readonly ActiveHoldRow[], locked: readonly ActiveHoldRow[]) =>
  seen.length === locked.length &&
  seen.every((hold, index) => hold.id === locked[index]?.id && hold.status === locked[index]?.status && hold.copy_id === locked[index]?.copy_id);

/**
 * Deletes the account of a cleared Member (ADR 0011), after `verifyDeletionPassword`.
 *
 * In one transaction: the Member's row is locked first (as every writer does, so
 * no Loan, return or settle of theirs is half done), Clearance is read under it
 * and a Member who is not cleared is refused with 409 `not_cleared` and the
 * reason. Then every waiting or ready Hold is cancelled, and each ready Hold's
 * Copy goes on through Hold dispatch as with any cancel; the Saved books,
 * the phones that get push notifications,
 * Digital ID, desk sessions and Forgot password rows go; the Member record
 * keeps its id and Account Type and loses every personal field; and the
 * sign-in (`auth.users`) is deleted, which ends every session. The deletion is
 * written to the audit log in the same transaction, so it is all or nothing.
 *
 * A ready Hold whose Pickup Window has already ended is expired first, as the
 * sweep would. The lock order is the one of ADR 0006: the Member, the Copies
 * set aside for their ready Holds (in id order), then the Holds. When a Hold
 * changed between the unlocked read and the locks (a dispatch made it ready),
 * the transaction starts again.
 *
 * After the commit, the Members whose Holds became ready and the deleted
 * Member are emailed. A failed email is logged, never thrown: the account is gone.
 */
export async function deleteMemberAccount(deps: AppDeps, request: AccountDeletionRequest): Promise<void> {
  await expireDueHolds(deps, { memberId: request.member.id });
  const dispatches = await retryOnConflict(
    {
      attempts: ATTEMPTS,
      isConflict: (error) => error instanceof HoldsChanged,
      exhausted: () => new AppError(409, "account_changed", "Your Holds changed just now. Please try again."),
    },
    () => withTransaction(deps.db, (tx) => deleteOnce(deps, tx, request)),
  );
  for (const dispatch of dispatches) await announceDispatch(deps, dispatch);
  try {
    await deps.email.send({ to: request.member.email, ...accountDeletedEmail(deps.clock.now()) });
  } catch (error) {
    deps.logger.error("The account deleted email could not be sent", error);
  }
}

async function deleteOnce(deps: AppDeps, tx: Tx, { member, clientAddress }: AccountDeletionRequest): Promise<HoldDispatch[]> {
  const now = deps.clock.now();
  await lockMember(tx, member.id);
  const clearance = clearanceOf(await readStanding(tx, member.id, now));
  if (!clearance.cleared) throw new AppError(409, "not_cleared", notClearedNotice(clearance).message);

  const seen = (await tx.query<ActiveHoldRow>(ACTIVE_HOLDS_SQL, [member.id])).rows;
  const setAside = seen.flatMap((hold) => (hold.status === "ready" && hold.copy_id !== null ? [hold.copy_id] : [])).sort();
  const copies: CopyRow[] = [];
  for (const copyId of setAside) {
    const copy = await lockCopy(tx, { id: copyId });
    if (!copy) throw new HoldsChanged();
    copies.push(copy);
  }
  const locked = (await tx.query<ActiveHoldRow>(`${ACTIVE_HOLDS_SQL} for update`, [member.id])).rows;
  if (!sameHolds(seen, locked)) throw new HoldsChanged();

  await tx.query("update public.holds set status = 'cancelled', cancelled_at = $2 where member_id = $1 and status in ('waiting', 'ready')", [
    member.id,
    now,
  ]);
  await tx.query("delete from public.saved_books where member_id = $1", [member.id]);
  await forgetPushDevicesOf(tx, member.id);
  await tx.query("delete from public.digital_id_secrets where member_id = $1", [member.id]);
  await tx.query("delete from public.digital_id_uses where member_id = $1", [member.id]);
  await tx.query("delete from public.desk_sessions where member_id = $1", [member.id]);
  await tx.query("delete from public.password_resets where email = lower($1)", [member.email]);
  await tx.query("delete from public.password_reset_attempts where email = lower($1)", [member.email]);
  await tx.query(
    `update public.members
        set first_name = null, middle_name = null, last_name = null, username = null,
            contact_number = null, details = '{}'::jsonb, deleted_at = $2
      where user_id = $1`,
    [member.id, now],
  );
  // Supabase Auth's sessions and refresh tokens go with the user (foreign keys with on delete cascade).
  await tx.query("delete from auth.users where id = $1", [member.id]);

  // Last, as `dispatchCopy` asks: the audit entries, the deletion's first, then each dispatch it causes.
  const deleted: AuditEvent = {
    type: "account_deleted",
    actorId: member.id,
    subject: member.id,
    data: { accountType: member.accountType, holdsCancelled: locked.length, clientAddress: auditClientAddress(clientAddress) },
  };
  if (copies.length === 0) {
    await createAuditLog(deps).record(deleted, tx);
    return [];
  }
  const dispatches: HoldDispatch[] = [];
  for (const [index, copy] of copies.entries()) {
    const dispatch = await dispatchCopy(deps, tx, copy, {
      at: now,
      cause: "hold_cancelled",
      actorId: member.id,
      ...(index === 0 ? { causeEntries: [deleted] } : {}),
    });
    if (dispatch) dispatches.push(dispatch);
  }
  return dispatches;
}
