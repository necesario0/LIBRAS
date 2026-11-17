import { isLoanOverdue, libraryDaysBetween } from "@libras/shared";
import type { LoanFine } from "@libras/shared";
import type { AuditEvent } from "../audit/index.ts";
import type { Tx } from "../db.ts";

/**
 * Fines (ADR 0010). This file is the one place that says how much a late Loan
 * costs (`fineAt`), and the one place that fixes the amount at a return
 * (`fixFine`). My Loans, the desk's return and the Loan notices all go through
 * it, so they agree to the centavo at the same moment.
 */

/** The parts of a Loan Policy row a Fine depends on. */
export interface FinePolicy {
  fine_daily_rate_centavos: number;
  fine_cap_centavos: number;
}

/**
 * The Fine of a Loan due at `dueAt` that is still out (or comes back) at `at`:
 * the daily rate for every calendar day of the library after the due date, the
 * day of `at` included, up to the cap. No grace period: the first moment after
 * the due date is one day late. Null when the Loan is not overdue at `at`, or
 * when the policy's rate (or cap) is zero, so nothing is owed.
 */
export function fineAt(dueAt: Date, policy: FinePolicy, at: Date): LoanFine | null {
  if (!isLoanOverdue(dueAt, at)) return null;
  // Every due date is the last moment of a library day, so overdue means at least one day later.
  const daysLate = Math.max(1, libraryDaysBetween(dueAt.toISOString(), at.toISOString()));
  const amountCentavos = Math.min(daysLate * policy.fine_daily_rate_centavos, policy.fine_cap_centavos);
  if (amountCentavos <= 0) return null;
  return {
    amountCentavos,
    daysLate,
    dailyRateCentavos: policy.fine_daily_rate_centavos,
    capCentavos: policy.fine_cap_centavos,
    final: false,
  };
}

/** A stored Fine, as `FINE_COLUMNS` reads it: null columns when the Loan has none. */
export interface FineColumns {
  fine_days_late: number | null;
  fine_daily_rate_centavos: number | null;
  fine_cap_centavos: number | null;
  fine_amount_centavos: number | null;
}

/** The columns of `FineColumns`, from `public.fines` joined as `f`. */
export const FINE_COLUMNS = `f.days_late as fine_days_late, f.daily_rate_centavos as fine_daily_rate_centavos,
         f.cap_centavos as fine_cap_centavos, f.amount_centavos as fine_amount_centavos`;

/** The Fine fixed at a Loan's return, or null when it has none. */
export function storedFine(row: FineColumns): LoanFine | null {
  if (row.fine_amount_centavos === null) return null;
  return {
    amountCentavos: row.fine_amount_centavos,
    daysLate: row.fine_days_late as number,
    dailyRateCentavos: row.fine_daily_rate_centavos as number,
    capCentavos: row.fine_cap_centavos as number,
    final: true,
  };
}

/** A Loan being returned, as `fixFine` needs it. */
export interface ReturningLoan {
  id: string;
  member_id: string;
  due_at: Date;
}

/**
 * Fixes the Fine of a Loan returned at `returnedAt`, in the transaction of the
 * return (which has the Member's row locked): the amount at that moment under
 * the Member's current Loan Policy is stored and never changes again. Returns
 * the Fine with its audit entry (`fine_fixed`, recorded by the caller with the
 * return's own entries), or null when the Copy came back on time or nothing is
 * owed.
 */
export async function fixFine(
  tx: Tx,
  loan: ReturningLoan,
  policy: FinePolicy,
  returnedAt: Date,
  librarianId: string,
): Promise<{ fine: LoanFine; entry: AuditEvent } | null> {
  const owed = fineAt(loan.due_at, policy, returnedAt);
  if (!owed) return null;
  await tx.query(
    `insert into public.fines (loan_id, member_id, days_late, daily_rate_centavos, cap_centavos, amount_centavos, fixed_at)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [loan.id, loan.member_id, owed.daysLate, owed.dailyRateCentavos, owed.capCentavos, owed.amountCentavos, returnedAt],
  );
  return {
    fine: { ...owed, final: true },
    entry: {
      type: "fine_fixed",
      actorId: librarianId,
      subject: loan.id,
      data: {
        memberId: loan.member_id,
        daysLate: owed.daysLate,
        dailyRateCentavos: owed.dailyRateCentavos,
        capCentavos: owed.capCentavos,
        amountCentavos: owed.amountCentavos,
      },
    },
  };
}
