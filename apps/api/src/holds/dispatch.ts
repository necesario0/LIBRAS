import type pg from "pg";
import { formatLibraryDateTime } from "@libras/shared";
import type { AppDeps } from "../app.ts";
import { createAuditLog } from "../audit/index.ts";
import type { EmailMessage } from "../email.ts";
import { MEMBER_NAME_SQL } from "../members/profile.ts";

/** The client of a transaction run as the API itself (`withTransaction`). */
type Tx = pg.PoolClient;

/** What dispatch needs to know about the Copy it places. */
export interface DispatchableCopy {
  id: string;
  book_id: string;
  accession_number: string;
  /** The title of the Copy's Book. */
  title: string;
}

/** A Copy as `lockCopyById` reads it. */
export interface LockedCopy extends DispatchableCopy {
  status: "available" | "on_loan" | "set_aside";
}

/**
 * Why a Copy is being placed: it came back from a Loan, the Member it was set
 * aside for cancelled their ready Hold, or their Pickup Window passed. Recorded
 * in the audit entry.
 */
export type DispatchCause = "copy_returned" | "hold_cancelled" | "pickup_window_expired";

export interface DispatchContext {
  /** The time of the dispatch, from `deps.clock.now()`: the start of the Pickup Window. */
  at: Date;
  cause: DispatchCause;
  /** The signed-in person whose action freed the Copy: the Librarian of a return, the Member of a cancel, nobody for an expiry. */
  actorId: string | null;
}

/** A Hold that was just chosen: its Copy is set aside for its Member until `pickupEndsAt`. */
export interface HoldDispatch {
  holdId: string;
  memberId: string;
  /** The Member's name as the desk writes it. */
  memberName: string;
  memberEmail: string;
  bookTitle: string;
  accessionNumber: string;
  /** The end of the Pickup Window. */
  pickupEndsAt: Date;
}

interface ChosenRow {
  id: string;
  member_id: string;
  pickup_ends_at: Date;
  member_name: string;
  email: string;
}

/**
 * The Role-Weighted Priority Queue Dispatcher of ADR 0001, as the one query
 * that is the queue: the Book's waiting Hold with the lowest (score, seq),
 * found through the partial index `holds_queue_idx`, becomes ready for this
 * Copy with the Pickup Window starting at `$3` and lasting the stored setting.
 * `for update skip locked` means two dispatches at once never choose the same
 * Hold, and a Hold that is being cancelled at this moment is passed over.
 */
const DISPATCH_SQL = `
  with chosen as (
    update public.holds h
       set status = 'ready',
           copy_id = $2,
           ready_at = $3,
           pickup_ends_at = $3::timestamptz + make_interval(hours => (select pickup_window_hours from public.library_settings))
     where h.id = (
             select q.id
               from public.holds q
              where q.book_id = $1 and q.status = 'waiting'
              order by q.score, q.seq
              limit 1
                for update skip locked
           )
    returning h.id, h.member_id, h.pickup_ends_at
  )
  select chosen.id, chosen.member_id, chosen.pickup_ends_at, ${MEMBER_NAME_SQL} as member_name, u.email
    from chosen
    join public.members m on m.user_id = chosen.member_id
    join auth.users u on u.id = chosen.member_id`;

/**
 * Places a Copy that nobody has any more: the Book's next waiting Hold becomes
 * ready and the Copy is set aside for its Member for the Pickup Window, or,
 * with no Hold waiting, the Copy becomes available. This is the one place a
 * Copy leaves a Loan, a cancelled ready Hold or an expired one.
 *
 * The caller's rules:
 * - Call it inside a transaction in which the Copy's row is already locked
 *   (`for no key update`: `lockCopy` of the Loans module, or `lockCopyById`),
 *   and in which the Copy no longer belongs to anyone (its Loan is closed, or
 *   its ready Hold is cancelled or expired). The lock order of every writer is
 *   the Member's row, then the Copy's row, then a Hold's row.
 * - Call it last: it records the `hold_dispatched` audit entry, and other
 *   writers of the audit log wait until the transaction ends.
 * - After the transaction commits, pass the result to `announceDispatch`.
 */
export async function dispatchCopy(
  deps: Pick<AppDeps, "db" | "clock">,
  tx: Tx,
  copy: DispatchableCopy,
  context: DispatchContext,
): Promise<HoldDispatch | null> {
  const { rows } = await tx.query<ChosenRow>(DISPATCH_SQL, [copy.book_id, copy.id, context.at]);
  const chosen = rows[0];
  await tx.query("update public.copies set status = $2 where id = $1", [copy.id, chosen ? "set_aside" : "available"]);
  if (!chosen) return null;

  await createAuditLog(deps).record(
    {
      type: "hold_dispatched",
      actorId: context.actorId,
      subject: chosen.id,
      data: {
        memberId: chosen.member_id,
        copyId: copy.id,
        bookId: copy.book_id,
        accessionNumber: copy.accession_number,
        pickupEndsAt: chosen.pickup_ends_at.toISOString(),
        cause: context.cause,
      },
    },
    tx,
  );
  return {
    holdId: chosen.id,
    memberId: chosen.member_id,
    memberName: chosen.member_name,
    memberEmail: chosen.email,
    bookTitle: copy.title,
    accessionNumber: copy.accession_number,
    pickupEndsAt: chosen.pickup_ends_at,
  };
}

/**
 * The Copy with this id, with its row locked until the transaction ends, for a
 * writer that starts from a Hold and not from a scan (cancelling a ready Hold,
 * a Pickup Window passing). Lock the Copy before the Hold's row.
 */
export async function lockCopyById(tx: Tx, copyId: string): Promise<LockedCopy | undefined> {
  const { rows } = await tx.query<LockedCopy>(
    `select c.id, c.book_id, c.accession_number, c.status, b.title
       from public.copies c
       join public.books b on b.id = c.book_id
      where c.id = $1
        for no key update of c`,
    [copyId],
  );
  return rows[0];
}

/** The email a Member gets when their Hold is ready. */
export function holdReadyEmail(dispatch: Pick<HoldDispatch, "bookTitle" | "pickupEndsAt">): Pick<EmailMessage, "subject" | "text"> {
  const until = formatLibraryDateTime(dispatch.pickupEndsAt.toISOString());
  return {
    subject: "Your LIBRAS Hold is ready for pickup",
    text:
      `Your Hold on "${dispatch.bookTitle}" is ready for pickup.\n\n` +
      `A Copy is set aside for you at the library desk until ${until}. ` +
      "Show your Digital ID to the librarian to borrow it.\n\n" +
      "If you do not borrow it by then, your Hold expires and the Copy goes to the next Member in the queue.\n\n" +
      "If you no longer need the Book, cancel the Hold in the LIBRAS app.",
  };
}

/**
 * Tells the Member their Hold is ready. Call it after the transaction of
 * `dispatchCopy` has committed, never inside it: an email cannot be rolled
 * back. A failure to send is logged and not thrown, because the Hold is ready
 * whether or not the email leaves, and the app shows it.
 */
export async function announceDispatch(deps: Pick<AppDeps, "email" | "logger">, dispatch: HoldDispatch | null): Promise<void> {
  if (!dispatch) return;
  try {
    await deps.email.send({ to: dispatch.memberEmail, ...holdReadyEmail(dispatch) });
  } catch (error) {
    deps.logger.error(`The Hold-ready email for Hold ${dispatch.holdId} could not be sent`, error);
  }
}
