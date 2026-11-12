import { HOLD_MESSAGES, canBorrow } from "@libras/shared";
import type { Hold, HoldStatus, MemberProfile } from "@libras/shared";
import type { AppDeps } from "../app.ts";
import type { Identity } from "../auth/auth-provider.ts";
import { withIdentity } from "../auth/identity.ts";
import { withTransaction } from "../db.ts";
import { AppError } from "../errors.ts";
import { HOLD_WEIGHT_HOURS, holdScore } from "./priority.ts";

interface HoldRow {
  id: string;
  book_id: string;
  title: string;
  authors: string[];
  status: HoldStatus;
  placed_at: Date;
}

function toHold(row: HoldRow): Hold {
  return {
    id: row.id,
    bookId: row.book_id,
    bookTitle: row.title,
    bookAuthors: row.authors,
    status: row.status,
    placedAt: row.placed_at.toISOString(),
  };
}

/** PostgreSQL's code for a unique index refusing a row. */
const UNIQUE_VIOLATION = "23505";

/**
 * Puts the Member in the queue of a Book that has no available Copy. Refused when the
 * Member's Account Type cannot borrow, when the Book does not exist, when a Copy is
 * available (borrow it instead) and when the Member already has an active Hold on the
 * Book (the database's unique index decides that, so two requests at once cannot both pass).
 */
export async function placeHold(deps: AppDeps, member: MemberProfile, bookId: string): Promise<Hold> {
  if (!canBorrow(member.accountType)) throw new AppError(403, "cannot_borrow", HOLD_MESSAGES.cannotBorrow);
  const placedAt = deps.clock.now();
  try {
    return await withTransaction(deps.db, async (tx) => {
      const book = await tx.query<{ available_copies: number }>(
        `select (count(c.id) filter (where c.status = 'available'))::int as available_copies
           from public.books b
           left join public.copies c on c.book_id = b.id
          where b.id = $1
          group by b.id`,
        [bookId],
      );
      if (!book.rows[0]) throw new AppError(404, "book_not_found", "We could not find this Book. It may have been removed from the catalog.");
      if (book.rows[0].available_copies > 0) throw new AppError(409, "copy_available", HOLD_MESSAGES.copyAvailable);

      const inserted = await tx.query<HoldRow>(
        `with inserted as (
           insert into public.holds (book_id, member_id, placed_at, weight_hours, score)
           values ($1, $2, $3, $4, $5)
           returning id, book_id, status, placed_at
         )
         select h.id, h.book_id, b.title, b.authors, h.status, h.placed_at
           from inserted h join public.books b on b.id = h.book_id`,
        [bookId, member.id, placedAt, HOLD_WEIGHT_HOURS[member.accountType], holdScore(placedAt, member.accountType)],
      );
      return toHold(inserted.rows[0] as HoldRow);
    });
  } catch (error) {
    if ((error as { code?: string }).code === UNIQUE_VIOLATION) throw new AppError(409, "hold_exists", HOLD_MESSAGES.alreadyHeld);
    throw error;
  }
}

/**
 * The Member's own Holds, active ones first and each group newest first. Read as the
 * Member, so row-level security shows nobody else's.
 */
export async function listHolds(deps: AppDeps, identity: Identity): Promise<Hold[]> {
  const rows = await withIdentity(deps.db, identity, async (scope) => {
    const result = await scope.query<HoldRow>(
      `select h.id, h.book_id, b.title, b.authors, h.status, h.placed_at
         from public.holds h join public.books b on b.id = h.book_id
        order by (h.status in ('waiting', 'ready')) desc, h.placed_at desc, h.seq desc`,
    );
    return result.rows;
  });
  return rows.map(toHold);
}

/**
 * Takes the Member out of the queue. Only a waiting Hold can be cancelled here. A Hold
 * that is not the Member's is reported as not found, the same as one that does not exist.
 */
export async function cancelHold(deps: AppDeps, member: MemberProfile, holdId: string): Promise<Hold> {
  const cancelledAt = deps.clock.now();
  return withTransaction(deps.db, async (tx) => {
    const found = await tx.query<{ status: HoldStatus }>(
      "select status from public.holds where id = $1 and member_id = $2 for update",
      [holdId, member.id],
    );
    if (!found.rows[0]) throw new AppError(404, "hold_not_found", HOLD_MESSAGES.holdNotFound);
    if (found.rows[0].status !== "waiting") throw new AppError(409, "hold_not_cancellable", HOLD_MESSAGES.notCancellable);
    const updated = await tx.query<HoldRow>(
      `with updated as (
         update public.holds set status = 'cancelled', cancelled_at = $2 where id = $1
         returning id, book_id, status, placed_at
       )
       select h.id, h.book_id, b.title, b.authors, h.status, h.placed_at
         from updated h join public.books b on b.id = h.book_id`,
      [holdId, cancelledAt],
    );
    return toHold(updated.rows[0] as HoldRow);
  });
}
