import type { HoldStatus } from "@libras/shared";
import type { AppDeps } from "../app.ts";
import { withTransaction } from "../db.ts";
import { announceDispatch, dispatchCopy, lockCopyById } from "./dispatch.ts";
import type { HoldDispatch } from "./dispatch.ts";

export type ExpiryOutcome = "expired" | "skipped";

/**
 * Ends the Pickup Window of one Hold, if it has really passed: the Hold becomes
 * `expired` and, in the same transaction, its Copy goes to the Book's next
 * waiting Hold with a Pickup Window of its own starting now, or becomes
 * available (`dispatchCopy`, cause `pickup_window_expired`). The Member whose
 * Hold became ready is emailed once the transaction has committed.
 *
 * It does nothing (`skipped`) when the Hold is no longer ready (the Member
 * borrowed the Copy or cancelled meanwhile) or its window has not passed. The
 * window has passed at `pickup_ends_at` itself: a Member cannot borrow at that
 * instant (`takeCopy`).
 *
 * Locks, in the order of ADR 0006: the Copy's row, then the Hold's row. An
 * unlocked read says which Copy that is, as in cancelling a ready Hold. A ready
 * Hold never changes its Copy, so after both locks the Hold is only read again
 * to see whether it is still ready.
 */
export async function expireHold(deps: AppDeps, holdId: string): Promise<ExpiryOutcome> {
  let dispatch: HoldDispatch | null = null;
  const outcome = await withTransaction(deps.db, async (tx): Promise<ExpiryOutcome> => {
    const now = deps.clock.now();
    const seen = await tx.query<{ copy_id: string }>("select copy_id from public.holds where id = $1 and status = 'ready'", [holdId]);
    const setAside = seen.rows[0]?.copy_id;
    if (setAside === undefined) return "skipped";

    const copy = await lockCopyById(tx, setAside);
    const locked = await tx.query<{ status: HoldStatus; copy_id: string | null; member_id: string; pickup_ends_at: Date | null }>(
      "select status, copy_id, member_id, pickup_ends_at from public.holds where id = $1 for update",
      [holdId],
    );
    const hold = locked.rows[0];
    if (!copy || !hold || hold.status !== "ready" || hold.copy_id !== copy.id || hold.pickup_ends_at === null) return "skipped";
    if (hold.pickup_ends_at.getTime() > now.getTime()) return "skipped";

    await tx.query("update public.holds set status = 'expired', expired_at = $2 where id = $1", [holdId, now]);
    // Last, as `dispatchCopy` asks: it records the expiry and then the dispatch it causes. Nothing here waits
    // for a row another writer holds: the dispatch skips a locked waiting Hold, and the Copy's row is already ours.
    dispatch = await dispatchCopy(deps, tx, copy, {
      at: now,
      cause: "pickup_window_expired",
      actorId: null,
      causeEntry: {
        type: "hold_expired",
        subject: holdId,
        data: {
          memberId: hold.member_id,
          copyId: copy.id,
          bookId: copy.book_id,
          accessionNumber: copy.accession_number,
          pickupEndsAt: hold.pickup_ends_at.toISOString(),
          expiredAt: now.toISOString(),
        },
      },
    });
    return "expired";
  });
  await announceDispatch(deps, dispatch);
  return outcome;
}

/** How many due Holds one query reads. */
const BATCH_SIZE = 100;

/**
 * Expires every ready Hold whose Pickup Window has passed (or only one
 * Member's), one transaction per Hold, the oldest window first, and returns
 * how many it expired. A Hold that cannot be expired is logged and left for the
 * next run, and does not stop the others. Running it twice at once, or while a
 * Member borrows, is safe: `expireHold` re-checks the Hold under its locks.
 *
 * This is the sweep. It runs on its own (`startPickupSweeper`, and the
 * database's schedule through `POST /internal/sweeps/pickup-expiry`), and it
 * also runs where a Member would otherwise see an expired window as still
 * running (their list of Holds).
 */
export async function expireDueHolds(deps: AppDeps, scope: { memberId?: string } = {}): Promise<number> {
  let expired = 0;
  for (;;) {
    const due = await deps.db.query<{ id: string }>(
      `select id
         from public.holds
        where status = 'ready' and pickup_ends_at <= $1 and ($2::uuid is null or member_id = $2)
        order by pickup_ends_at, seq
        limit ${BATCH_SIZE}`,
      [deps.clock.now(), scope.memberId ?? null],
    );
    let progress = 0;
    for (const { id } of due.rows) {
      try {
        if ((await expireHold(deps, id)) === "expired") progress += 1;
      } catch (error) {
        deps.logger.error(`The Pickup Window of Hold ${id} could not be ended`, error);
      }
    }
    expired += progress;
    if (due.rows.length < BATCH_SIZE || progress === 0) return expired;
  }
}
