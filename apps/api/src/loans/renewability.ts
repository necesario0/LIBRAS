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
  /** The Loan, as its row reads: the current due date and how often it was renewed. */
  loan: { due_at: Date; renewal_count: number };
  /** The Member's Loan Policy. `loan_period_days` is null for an Account Type that cannot borrow. */
  policy: { renewal_limit: number; loan_period_days: number | null };
  /** Another Member's Hold on the Book is waiting. */
  holdWaiting: boolean;
  /** Why the Member is not in Good standing (`goodStandingRefusal`), or null when they are. */
  notInGoodStanding: GoodStandingRefusal | null;
  /** The API's clock. */
  now: Date;
}

/**
 * Whether a current Loan can be renewed at `now`, and if not, why: the one
 * place that decides it, for the Loans list, for the Renewal itself and for
 * anything that tells the Member about it. The reasons are checked in the
 * order of `RENEWAL_REFUSALS`. An Account Type that cannot borrow has no loan
 * period to add, so its Loans (which it cannot have) count as out of Renewals.
 */
export function renewalOf({ loan, policy, holdWaiting, notInGoodStanding, now }: RenewalFacts): LoanRenewal {
  if (isLoanOverdue(loan.due_at, now)) return { renewable: false, reason: "loan_overdue" };
  if (policy.loan_period_days === null || loan.renewal_count >= policy.renewal_limit) {
    return { renewable: false, reason: "renewal_limit_reached" };
  }
  if (holdWaiting) return { renewable: false, reason: "hold_waiting" };
  if (notInGoodStanding !== null) return { renewable: false, reason: notInGoodStanding };
  return {
    renewable: true,
    dueAt: renewedDueAt(loan.due_at, policy.loan_period_days).toISOString(),
    last: loan.renewal_count + 1 >= policy.renewal_limit,
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
