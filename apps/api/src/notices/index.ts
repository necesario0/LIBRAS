import type { AppDeps } from "../app.ts";
import type { Database, Tx } from "../db.ts";
import { withTransaction } from "../db.ts";
import { fineAt } from "../fines/index.ts";
import type { FinePolicy } from "../fines/index.ts";
import { booksWithWaitingHolds, renewalOf } from "../loans/renewability.ts";
import { loanNoticeEmail } from "./email.ts";
import type { NoticeLoan } from "./email.ts";
import { libraryDate, libraryDayOf, noticeDue, noticeWindow } from "./schedule.ts";
import type { LoanNoticeSlot } from "./schedule.ts";

/** A current Loan whose due date can have a notice due, and the notices already sent for that due date. */
interface CandidateRow {
  id: string;
  member_id: string;
  book_id: string;
  title: string;
  accession_number: string;
  due_at: Date;
  renewal_count: number;
  /** "kind:repeat" of every notice already sent for the current due date. */
  sent: string[];
}

const slotKey = (slot: LoanNoticeSlot) => `${slot.kind}:${slot.repeat}`;

/**
 * Current Loans (of one Member, or of everyone) that may have a notice due at
 * `now`, leaving out the Members who already had their email of this library
 * day: they get the rest tomorrow. `only` reads one Member's, under the email
 * row the caller has just inserted.
 */
async function candidates(
  db: Database | Tx,
  now: Date,
  only: { memberId: string; emailId: string } | null,
): Promise<CandidateRow[]> {
  const { earliest, latest } = noticeWindow(now);
  const { rows } = await db.query<CandidateRow>(
    `select l.id, l.member_id, c.book_id, b.title, c.accession_number, l.due_at, l.renewal_count,
            array(select n.kind || ':' || n.repeat from public.loan_notices n
                   where n.loan_id = l.id and n.due_at = l.due_at) as sent
       from public.loans l
       join public.copies c on c.id = l.copy_id
       join public.books b on b.id = c.book_id
      where l.returned_at is null
        and l.due_at between $1 and $2
        and ($4::uuid is null or l.member_id = $4)
        and not exists (select 1 from public.loan_notice_emails e
                         where e.member_id = l.member_id and e.library_day = $3::date
                           and e.id is distinct from $5::uuid)
      order by l.member_id, l.due_at, b.title, l.id`,
    [earliest, latest, libraryDate(libraryDayOf(now)), only?.memberId ?? null, only?.emailId ?? null],
  );
  return rows;
}

/** The candidates that have a notice due and not yet sent, with that notice. */
function pending(rows: readonly CandidateRow[], now: Date): Array<CandidateRow & { slot: LoanNoticeSlot }> {
  return rows.flatMap((row) => {
    const slot = noticeDue(row.due_at, now);
    return slot && !row.sent.includes(slotKey(slot)) ? [{ ...row, slot }] : [];
  });
}

interface MemberRow extends FinePolicy {
  email: string;
  first_name: string;
  loan_period_days: number | null;
  renewal_limit: number;
}

/**
 * Sends one Member the email of this library day, covering every Loan of theirs
 * with a notice due, and records each notice. Returns whether an email went out.
 *
 * The email's row (one per Member and library day) is inserted first: a second
 * tick doing the same waits on it, and finds it taken once this one commits.
 * The notices' rows are written in the same transaction, which commits only
 * after the email sender accepted the email; a refused send rolls everything
 * back, so the next tick tries again.
 */
async function notifyMember(deps: AppDeps, memberId: string): Promise<boolean> {
  return withTransaction(deps.db, async (tx) => {
    const now = deps.clock.now();
    const email = await tx.query<{ id: string }>(
      `insert into public.loan_notice_emails (member_id, library_day, sent_at) values ($1, $2::date, $3)
       on conflict (member_id, library_day) do nothing
       returning id`,
      [memberId, libraryDate(libraryDayOf(now)), now],
    );
    const emailId = email.rows[0]?.id;
    if (emailId === undefined) return false;

    // Read again under the email's row: a notice another tick sent meanwhile is no longer due.
    const due = pending(await candidates(tx, now, { memberId, emailId }), now);
    if (due.length === 0) throw new NothingToSend();

    for (const loan of due) {
      await tx.query("insert into public.loan_notices (loan_id, kind, due_at, repeat, email_id) values ($1, $2, $3, $4, $5)", [
        loan.id,
        loan.slot.kind,
        loan.due_at,
        loan.slot.repeat,
        emailId,
      ]);
    }

    const member = await tx.query<MemberRow>(
      `select u.email, m.first_name, p.loan_period_days, p.renewal_limit, p.fine_daily_rate_centavos, p.fine_cap_centavos
         from public.members m
         join auth.users u on u.id = m.user_id
         join public.loan_policies p on p.account_type = m.account_type
        where m.user_id = $1`,
      [memberId],
    );
    const row = member.rows[0];
    if (!row) throw new Error(`No Member or Loan Policy for ${memberId}`);
    const waiting = await booksWithWaitingHolds(
      tx,
      memberId,
      due.filter((loan) => loan.slot.kind === "due_tomorrow").map((loan) => loan.book_id),
    );
    const loans: NoticeLoan[] = due.map((loan) => ({
      slot: loan.slot,
      title: loan.title,
      accessionNumber: loan.accession_number,
      dueAt: loan.due_at,
      renewal:
        loan.slot.kind === "due_tomorrow"
          ? renewalOf(
              {
                dueAt: loan.due_at,
                renewalCount: loan.renewal_count,
                renewalLimit: row.renewal_limit,
                loanPeriodDays: row.loan_period_days,
                holdWaiting: waiting.has(loan.book_id),
              },
              now,
            )
          : null,
      fineRate:
        loan.slot.kind === "due_tomorrow" && row.fine_daily_rate_centavos > 0 && row.fine_cap_centavos > 0
          ? { dailyRateCentavos: row.fine_daily_rate_centavos, capCentavos: row.fine_cap_centavos }
          : null,
      // The same Fine so far that My Loans shows at this moment.
      fineSoFar: loan.slot.kind === "due_tomorrow" ? null : (fineAt(loan.due_at, row, now)?.amountCentavos ?? null),
    }));

    await deps.email.send({ to: row.email, ...loanNoticeEmail({ firstName: row.first_name, loans, now }) });
    return true;
  }).catch((error: unknown) => {
    if (error instanceof NothingToSend) return false;
    throw error;
  });
}

/** Rolls back the email's row when, under it, nothing is left to send. */
class NothingToSend extends Error {}

/**
 * The Loan notice job of the sweep tick (ADR 0009): every Member with a Loan
 * notice due and not yet sent gets one email covering all of them, at most one
 * a library day. Returns how many emails went out. A Member whose email fails
 * is logged and tried again on the next tick, and does not stop the others.
 */
export async function sendLoanNotices(deps: AppDeps): Promise<number> {
  const now = deps.clock.now();
  const members = [...new Set(pending(await candidates(deps.db, now, null), now).map((row) => row.member_id))];
  let sent = 0;
  for (const memberId of members) {
    try {
      if (await notifyMember(deps, memberId)) sent += 1;
    } catch (error) {
      deps.logger.error(`The Loan notice email for Member ${memberId} could not be sent`, error);
    }
  }
  return sent;
}
