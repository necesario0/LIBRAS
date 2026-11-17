import { GOOD_STANDING_REFUSALS, isLoanOverdue } from "@libras/shared";
import type { Clearance, ClearanceLoan, GoodStanding, GoodStandingRefusal, UnsettledFine } from "@libras/shared";
import type { IdentityScope } from "../auth/identity.ts";
import { AppError } from "../errors.ts";

/**
 * Clearance and Good standing (ADR 0010). This file is the one place that says
 * what they are. Neither is stored: `readStanding` reads the Member's Loans
 * that are out and Fines that are unsettled, and `clearanceOf` and
 * `goodStandingOf` work the two answers out of those facts. The Profile
 * endpoint, the desk's Member panel and the refusals of a Loan, a Hold and a
 * Renewal all go through it, so they agree.
 */

/** What the two answers depend on: the Member's Loans still out and Fines not yet settled. */
export interface Standing {
  /** Every Loan still out, the one due soonest first. */
  loansOut: ClearanceLoan[];
  /** Every Fine not yet settled, the earliest return first. */
  unsettledFines: UnsettledFine[];
}

interface LoanOutRow {
  id: string;
  title: string;
  accession_number: string;
  due_at: Date;
}

interface UnsettledFineRow {
  loan_id: string;
  title: string;
  accession_number: string;
  amount_centavos: number;
  days_late: number;
  fixed_at: Date;
}

/**
 * The Member's standing facts at `now` (the API's clock, which decides what is
 * overdue). Runs through whatever `scope` is given: as the Member, so
 * row-level security shows only their own; as the Librarian for the desk; or
 * inside a writer's transaction after `lockMember`, where it sees every Fine
 * and return committed before the lock was taken (a return fixes a Fine, and a
 * settle changes one, with the Member's row locked).
 */
export async function readStanding(scope: IdentityScope, memberId: string, now: Date): Promise<Standing> {
  const loans = await scope.query<LoanOutRow>(
    `select l.id, b.title, c.accession_number, l.due_at
       from public.loans l
       join public.copies c on c.id = l.copy_id
       join public.books b on b.id = c.book_id
      where l.member_id = $1 and l.returned_at is null
      order by l.due_at, l.id`,
    [memberId],
  );
  const fines = await scope.query<UnsettledFineRow>(
    `select f.loan_id, b.title, c.accession_number, f.amount_centavos, f.days_late, f.fixed_at
       from public.fines f
       join public.loans l on l.id = f.loan_id
       join public.copies c on c.id = l.copy_id
       join public.books b on b.id = c.book_id
      where f.member_id = $1 and f.settled_at is null
      order by f.fixed_at, f.loan_id`,
    [memberId],
  );
  return {
    loansOut: loans.rows.map((row) => ({
      loanId: row.id,
      bookTitle: row.title,
      accessionNumber: row.accession_number,
      dueAt: row.due_at.toISOString(),
      overdue: isLoanOverdue(row.due_at, now),
    })),
    unsettledFines: fines.rows.map((row) => ({
      loanId: row.loan_id,
      bookTitle: row.title,
      accessionNumber: row.accession_number,
      amountCentavos: row.amount_centavos,
      daysLate: row.days_late,
      returnedAt: row.fixed_at.toISOString(),
    })),
  };
}

/** Cleared: no Loan still out, on time or not, and no unsettled Fine. Every Account Type is held to it. */
export function clearanceOf(standing: Standing): Clearance {
  return { cleared: standing.loansOut.length === 0 && standing.unsettledFines.length === 0, ...standing };
}

/**
 * Good standing: no overdue Loan and no unsettled Fine. A Loan that is out and
 * on time does not count against it (it does against Clearance). When not in
 * Good standing, every reason is named, in the order of `GOOD_STANDING_REFUSALS`.
 */
export function goodStandingOf(standing: Standing): GoodStanding {
  const present: Record<GoodStandingRefusal, boolean> = {
    overdue_loan: standing.loansOut.some((loan) => loan.overdue),
    unsettled_fine: standing.unsettledFines.length > 0,
  };
  const reasons = GOOD_STANDING_REFUSALS.filter((reason) => present[reason]);
  return reasons.length === 0 ? { inGoodStanding: true } : { inGoodStanding: false, reasons };
}

/**
 * Why the Member is not in Good standing at `now`, or null when they are. With
 * both an overdue Loan and an unsettled Fine, the overdue Loan is named: it
 * comes first in `GOOD_STANDING_REFUSALS`, and returning it is the first thing
 * to do. A writer calls this inside its transaction, after `lockMember`.
 */
export async function goodStandingRefusal(scope: IdentityScope, memberId: string, now: Date): Promise<GoodStandingRefusal | null> {
  const standing = goodStandingOf(await readStanding(scope, memberId, now));
  return standing.inGoodStanding ? null : (standing.reasons[0] ?? null);
}

/**
 * Refuses an action of a Member who is not in Good standing: `409`, with the
 * reason as the code and the action's own words for it. Confirming a Loan and
 * placing a Hold call it inside their transaction, after `lockMember`: a return
 * fixes a Fine, and a settle changes one, with that same lock held, so the
 * answer is never older than the action it guards.
 */
export async function requireGoodStanding(
  scope: IdentityScope,
  memberId: string,
  now: Date,
  messages: Readonly<Record<GoodStandingRefusal, string>>,
): Promise<void> {
  const reason = await goodStandingRefusal(scope, memberId, now);
  if (reason !== null) throw new AppError(409, reason, messages[reason]);
}
