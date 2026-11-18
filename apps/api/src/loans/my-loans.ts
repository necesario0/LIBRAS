import { isLoanOverdue } from "@libras/shared";
import type { GoodStandingRefusal, Loan, MyLoansResponse } from "@libras/shared";
import type { AppDeps } from "../app.ts";
import type { Identity } from "../auth/auth-provider.ts";
import { withIdentity } from "../auth/identity.ts";
import { FINE_COLUMNS, fineAt, storedFine } from "../fines/index.ts";
import type { FineColumns, FinePolicy } from "../fines/index.ts";
import { goodStandingRefusal } from "../standing/index.ts";
import { memberPolicy } from "./policy.ts";
import { booksWithWaitingHolds, renewalOf } from "./renewability.ts";

/** One Loan as a Member reads it: `LOAN_SELECT` gives these columns. */
export interface LoanRow extends FineColumns {
  id: string;
  copy_id: string;
  book_id: string;
  title: string;
  authors: string[];
  accession_number: string;
  checked_out_at: Date;
  due_at: Date;
  returned_at: Date | null;
  renewal_count: number;
}

/** Loans with their Copy, Book and fixed Fine, as `LoanRow`s: `l` is the Loan. Add a `where`. */
export const LOAN_SELECT = `
  select l.id, l.copy_id, c.book_id, b.title, b.authors, c.accession_number,
         l.checked_out_at, l.due_at, l.returned_at, l.renewal_count,
         ${FINE_COLUMNS}
    from public.loans l
    join public.copies c on c.id = l.copy_id
    join public.books b on b.id = c.book_id
    left join public.fines f on f.loan_id = l.id`;

/** The parts of the Member's Loan Policy that a Loan as the Member reads it depends on: Renewals and Fines. */
export interface RenewalPolicy extends FinePolicy {
  loan_period_days: number | null;
  renewal_limit: number;
}

/**
 * A Loan as the Member reads it. Overdue, whether it can be renewed and the
 * Fine so far are worked out at `now`, by the API's clock; `holdWaiting` says
 * whether another Member's Hold on the Book is waiting, and `notInGoodStanding`
 * why the Member is not in Good standing (null when they are). A returned Loan
 * has the Fine fixed at its return, whatever the policy says now.
 */
export function toLoan(
  row: LoanRow,
  policy: RenewalPolicy,
  facts: { holdWaiting: boolean; notInGoodStanding: GoodStandingRefusal | null },
  now: Date,
): Loan {
  const current = row.returned_at === null;
  return {
    id: row.id,
    bookId: row.book_id,
    bookTitle: row.title,
    bookAuthors: row.authors,
    accessionNumber: row.accession_number,
    checkedOutAt: row.checked_out_at.toISOString(),
    dueAt: row.due_at.toISOString(),
    returnedAt: row.returned_at?.toISOString() ?? null,
    overdue: current && isLoanOverdue(row.due_at, now),
    renewalCount: row.renewal_count,
    renewal: current
      ? renewalOf({ loan: row, policy, ...facts, now })
      : null,
    fine: current ? fineAt(row.due_at, policy, now) : storedFine(row),
  };
}

/**
 * The Member's own Loans: current ones first, the one due soonest at the top,
 * then past ones, the latest return first. Read as the Member, so row-level
 * security shows nobody else's (their Fines too). Overdue is worked out from
 * the due date by the API's clock, and so are whether each current Loan can be
 * renewed (`renewalOf`, with the Member's Good standing) and its Fine so far (`fineAt`): the app shows them and
 * holds no rules of its own. With them comes the loan limit of the Member's
 * Loan Policy.
 */
export async function listLoans(deps: AppDeps, identity: Identity): Promise<MyLoansResponse> {
  const now = deps.clock.now();
  const { rows, policy, notInGoodStanding } = await withIdentity(deps.db, identity, async (scope) => {
    const result = await scope.query<LoanRow>(
      `${LOAN_SELECT}
        where l.member_id = $1
        order by (l.returned_at is null) desc,
                 case when l.returned_at is null then l.due_at end,
                 l.returned_at desc,
                 l.checked_out_at desc`,
      [identity.userId],
    );
    const policy = await memberPolicy(scope, identity.userId, { lock: false });
    // As the Member: row-level security shows their own Loans and Fines, which is all Good standing reads.
    return { rows: result.rows, policy, notInGoodStanding: await goodStandingRefusal(scope, identity.userId, now) };
  });
  const waiting = await booksWithWaitingHolds(
    deps.db,
    identity.userId,
    rows.filter((row) => row.returned_at === null).map((row) => row.book_id),
  );
  return {
    loans: rows.map((row) => toLoan(row, policy, { holdWaiting: waiting.has(row.book_id), notInGoodStanding }, now)),
    loanLimit: policy.loan_limit,
    loanPeriodDays: policy.loan_period_days,
  };
}
