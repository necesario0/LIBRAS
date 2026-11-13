import { HOLD_MESSAGES, canBorrow } from "@libras/shared";
import type { Hold, HoldStatus, MemberProfile } from "@libras/shared";
import type { AppDeps } from "../app.ts";
import type { Identity } from "../auth/auth-provider.ts";
import { withIdentity } from "../auth/identity.ts";
import { isUniqueViolation, withTransaction } from "../db.ts";
import { AppError } from "../errors.ts";
import { announceDispatch, dispatchCopy, lockCopyById } from "./dispatch.ts";
import type { HoldDispatch } from "./dispatch.ts";
import { expireDueHolds, expireHold } from "./expiry.ts";
import { HOLD_WEIGHT_HOURS, holdScore } from "./priority.ts";

interface HoldRow {
  id: string;
  book_id: string;
  title: string;
  authors: string[];
  status: HoldStatus;
  placed_at: Date;
  pickup_ends_at: Date | null;
}

function toHold(row: HoldRow): Hold {
  return {
    id: row.id,
    bookId: row.book_id,
    bookTitle: row.title,
    bookAuthors: row.authors,
    status: row.status,
    placedAt: row.placed_at.toISOString(),
    pickupEndsAt: row.pickup_ends_at === null ? null : row.pickup_ends_at.toISOString(),
  };
}

/**
 * Puts the Member in the queue of a Book that has no available Copy. Refused when the
 * Member's Account Type cannot borrow, when the Book does not exist, when a Copy is
 * available (borrow it instead), when the Member has a Copy of the Book on Loan, and
 * when the Member already has an active Hold on the
 * Book (the database's unique index decides that, so two requests at once cannot both pass).
 *
 * The Book's Copies are read with a shared row lock (`for share`, in id order),
 * which waits for any return, Loan or dispatch that holds a Copy's row and
 * makes those wait for this Hold. Without it a Hold placed while a Copy is
 * being returned could miss both: the return finds no Hold and frees the Copy,
 * the Hold sees the Copy still out, and it is left waiting beside an available
 * Copy. It cannot deadlock: shared locks do not block each other, this takes
 * no other lock that a holder of a Copy's row waits for, and those holders
 * each lock one Copy only.
 */
export async function placeHold(deps: AppDeps, member: MemberProfile, bookId: string): Promise<Hold> {
  if (!canBorrow(member.accountType)) throw new AppError(403, "cannot_borrow", HOLD_MESSAGES.cannotBorrow);
  const placedAt = deps.clock.now();
  try {
    return await withTransaction(deps.db, async (tx) => {
      const book = await tx.query("select 1 from public.books where id = $1", [bookId]);
      if (!book.rows[0]) throw new AppError(404, "book_not_found", "We could not find this Book. It may have been removed from the catalog.");
      const copies = await tx.query<{ status: string }>(
        "select c.status from public.copies c where c.book_id = $1 order by c.id for share of c",
        [bookId],
      );
      if (copies.rows.some((copy) => copy.status === "available")) throw new AppError(409, "copy_available", HOLD_MESSAGES.copyAvailable);
      // Read after the Copies' locks, so a Loan to this Member confirmed at this moment is seen. Their own
      // return would otherwise set the Copy aside for them again.
      const onLoan = await tx.query(
        `select 1 from public.loans l join public.copies c on c.id = l.copy_id
          where c.book_id = $1 and l.member_id = $2 and l.returned_at is null
          limit 1`,
        [bookId, member.id],
      );
      if (onLoan.rows[0]) throw new AppError(409, "book_on_loan", HOLD_MESSAGES.bookOnLoan);

      const inserted = await tx.query<HoldRow>(
        `with inserted as (
           insert into public.holds (book_id, member_id, placed_at, weight_hours, score)
           values ($1, $2, $3, $4, $5)
           returning id, book_id, status, placed_at, pickup_ends_at
         )
         select h.id, h.book_id, b.title, b.authors, h.status, h.placed_at, h.pickup_ends_at
           from inserted h join public.books b on b.id = h.book_id`,
        [bookId, member.id, placedAt, HOLD_WEIGHT_HOURS[member.accountType], holdScore(placedAt, member.accountType)],
      );
      return toHold(inserted.rows[0] as HoldRow);
    });
  } catch (error) {
    if (isUniqueViolation(error, "holds_one_active_per_member_and_book")) throw new AppError(409, "hold_exists", HOLD_MESSAGES.alreadyHeld);
    throw error;
  }
}

/**
 * The Member's own Holds, active ones first and each group newest first. Read as the
 * Member, so row-level security shows nobody else's. A Hold whose Pickup Window
 * has ended is expired first (and the Copy passed on), so what the Member reads
 * never depends on when the expiry sweep last ran.
 */
export async function listHolds(deps: AppDeps, identity: Identity): Promise<Hold[]> {
  await expireDueHolds(deps, { memberId: identity.userId });
  const rows = await withIdentity(deps.db, identity, async (scope) => {
    const result = await scope.query<HoldRow>(
      `select h.id, h.book_id, b.title, b.authors, h.status, h.placed_at, h.pickup_ends_at
         from public.holds h join public.books b on b.id = h.book_id
        order by (h.status in ('waiting', 'ready')) desc, h.placed_at desc, h.seq desc`,
    );
    return result.rows;
  });
  return rows.map(toHold);
}

/** Thrown inside the cancel's transaction to roll it back and read the Hold again. */
class HoldChanged extends Error {}

/** Thrown inside the cancel's transaction when the Hold's Pickup Window has ended: it is expired, not cancelled. */
class WindowEnded extends Error {}

/** How many times a cancel reads the Hold again when it changed while the transaction waited for its locks. */
const CANCEL_ATTEMPTS = 3;

const CANCEL_SQL = `
  with updated as (
    update public.holds set status = 'cancelled', cancelled_at = $2 where id = $1
    returning id, book_id, status, placed_at, pickup_ends_at
  )
  select h.id, h.book_id, b.title, b.authors, h.status, h.placed_at, h.pickup_ends_at
    from updated h join public.books b on b.id = h.book_id`;

/**
 * Takes the Member out of the queue. A waiting Hold simply leaves it. A ready
 * Hold gives up the Copy that is set aside for it: in the same transaction the
 * Copy goes to the Book's next waiting Hold, with a Pickup Window of its own
 * starting now, or becomes available when nobody waits. A Hold that is
 * fulfilled, expired or already cancelled is refused, and so is a ready Hold
 * whose Pickup Window has ended but which the sweep has not expired yet: it is
 * expired here and then refused, as if the sweep had run first. A Hold that is not the
 * Member's is reported as not found, the same as one that does not exist.
 *
 * Locks: a waiting Hold needs only its own row. A ready Hold needs the Copy's
 * row too, and every writer locks the Copy before the Hold, so an unlocked read
 * says which case this is, the rows are locked in that order, and the Hold is
 * read again under the lock. When it changed in between (it was dispatched, or
 * its Copy was passed on) the transaction rolls back and starts again.
 */
export async function cancelHold(deps: AppDeps, member: MemberProfile, holdId: string): Promise<Hold> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      let dispatch: HoldDispatch | null = null;
      const cancelled = await withTransaction(deps.db, async (tx) => {
        const cancelledAt = deps.clock.now();
        const seen = await tx.query<{ status: HoldStatus; copy_id: string | null }>(
          "select status, copy_id from public.holds where id = $1 and member_id = $2",
          [holdId, member.id],
        );
        if (!seen.rows[0]) throw new AppError(404, "hold_not_found", HOLD_MESSAGES.holdNotFound);
        const setAside = seen.rows[0].status === "ready" ? seen.rows[0].copy_id : null;

        const copy = setAside === null ? undefined : await lockCopyById(tx, setAside);
        const locked = await tx.query<{ status: HoldStatus; copy_id: string | null; pickup_ends_at: Date | null }>(
          "select status, copy_id, pickup_ends_at from public.holds where id = $1 and member_id = $2 for update",
          [holdId, member.id],
        );
        const hold = locked.rows[0];
        if (!hold) throw new AppError(404, "hold_not_found", HOLD_MESSAGES.holdNotFound);
        if (hold.status !== "waiting" && hold.status !== "ready") {
          throw new AppError(409, "hold_not_cancellable", HOLD_MESSAGES.notCancellable);
        }
        // Dispatched while this waited: its Copy must be locked first, so start again.
        if (hold.status === "ready" && (!copy || copy.id !== hold.copy_id)) throw new HoldChanged();
        if (hold.status === "ready" && hold.pickup_ends_at !== null && hold.pickup_ends_at.getTime() <= cancelledAt.getTime()) throw new WindowEnded();

        const updated = await tx.query<HoldRow>(CANCEL_SQL, [holdId, cancelledAt]);
        // Last in the transaction: the Copy this Hold gave up goes to the next Hold, or back on the shelf.
        if (hold.status === "ready" && copy) {
          dispatch = await dispatchCopy(deps, tx, copy, { at: cancelledAt, cause: "hold_cancelled", actorId: member.id });
        }
        return toHold(updated.rows[0] as HoldRow);
      });
      await announceDispatch(deps, dispatch);
      return cancelled;
    } catch (error) {
      if (error instanceof WindowEnded) {
        await expireHold(deps, holdId);
        throw new AppError(409, "hold_not_cancellable", HOLD_MESSAGES.notCancellable);
      }
      if (!(error instanceof HoldChanged)) throw error;
      if (attempt >= CANCEL_ATTEMPTS) throw new AppError(409, "hold_conflict", HOLD_MESSAGES.changed);
    }
  }
}
