import { isLoanOverdue } from "@libras/shared";
import type { GoodStandingRefusal, LoanRenewal } from "@libras/shared";
import type { Database, Tx } from "../db.ts";

const DAY_MS = 24 * 3_600_000;

/**
 * The due date a Renewal gives: one loan period after the current due date,
 * so renewing early costs the Member no days. A due date is the last
 * millisecond of a library day, and the library's time has no daylight saving,
 * so whole days keep it there.
 */
export function renewedDueAt(dueAt: Date, loanPeriodDays: number): Date {
  return new Date(dueAt.getTime() + loanPeriodDays * DAY_MS);
}

/** What decides whether a current Loan can be renewed. */
export interface RenewalFacts {
  dueAt: Date;
  renewalCount: number;
  /** The renewal limit of the Member's Loan Policy. */
  renewalLimit: number;
  /** The loan period of the Member's Loan Policy; null for an Account Type that cannot borrow. */
  loanPeriodDays: number | null;
  /** Another Member's Hold on the Book is waiting. */
  holdWaiting: boolean;
  /** Why the Member is not in Good standing (`goodStandingRefusal`), or null when they are. */
  notInGoodStanding: GoodStandingRefusal | null;
}

/**
 * Whether a current Loan can be renewed at `now`, and if not, why: the one
 * place that decides it, for the Loans list, for the Renewal itself and for
 * anything that tells the Member about it. The reasons are checked in the
 * order of `RENEWAL_REFUSALS`. An Account Type that cannot borrow has no loan
 * period to add, so its Loans (which it cannot have) count as out of Renewals.
 */
export function renewalOf(facts: RenewalFacts, now: Date): LoanRenewal {
  if (isLoanOverdue(facts.dueAt, now)) return { renewable: false, reason: "loan_overdue" };
  if (facts.loanPeriodDays === null || facts.renewalCount >= facts.renewalLimit) {
    return { renewable: false, reason: "renewal_limit_reached" };
  }
  if (facts.holdWaiting) return { renewable: false, reason: "hold_waiting" };
  if (facts.notInGoodStanding !== null) return { renewable: false, reason: facts.notInGoodStanding };
  return {
    renewable: true,
    dueAt: renewedDueAt(facts.dueAt, facts.loanPeriodDays).toISOString(),
    last: facts.renewalCount + 1 >= facts.renewalLimit,
  };
}

/**
 * Which of these Books have a waiting Hold of a Member other than `memberId`.
 * Read as the API itself: row-level security hides other Members' Holds from
 * the Member, and only this yes or no about them leaves the API.
 */
export async function booksWithWaitingHolds(db: Database | Tx, memberId: string, bookIds: readonly string[]): Promise<Set<string>> {
  if (bookIds.length === 0) return new Set();
  const { rows } = await db.query<{ book_id: string }>(
    `select distinct book_id from public.holds
      where book_id = any($1) and status = 'waiting' and member_id <> $2`,
    [bookIds, memberId],
  );
  return new Set(rows.map((row) => row.book_id));
}
