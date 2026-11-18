import { RENEWAL_MESSAGES } from "@libras/shared";
import type { Loan } from "@libras/shared";
import type { AppDeps } from "../app.ts";
import { createAuditLog } from "../audit/index.ts";
import type { Identity } from "../auth/auth-provider.ts";
import { lockCopy } from "../copies/index.ts";
import { withTransaction } from "../db.ts";
import { AppError } from "../errors.ts";
import { LOAN_SELECT, toLoan } from "./my-loans.ts";
import type { LoanRow } from "./my-loans.ts";
import { lockMember } from "./policy.ts";
import { goodStandingRefusal } from "../standing/index.ts";
import { booksWithWaitingHolds, renewalOf } from "./renewability.ts";

/**
 * A Member renews one of their own Loans: its due date moves one loan period
 * of their Account Type later, counted from the current due date. It is
 * refused, with the reason the app shows, when the Loan is overdue, when it has
 * used the renewal limit of the Member's Loan Policy, when another Member's
 * Hold on the Book is waiting, or when the Member is not in Good standing
 * (`overdue_loan` or `unsettled_fine`; `renewalOf` decides, as it does for the Loans
 * list). A Loan that is not the Member's is reported as not found, the same as
 * one that does not exist; a Loan whose Copy is back is `loan_returned`.
 *
 * One transaction locks the Member's row, then the Copy's (the order every
 * writer keeps), reads the Loan and the Book's Holds, moves the due date and
 * records the audit entry last. The Member's lock makes a return of the Copy at
 * that moment come wholly before or after. The Copy's lock does the same for a
 * Hold being placed on the Book, which reads the Book's Copies `for share`: a
 * Hold placed first is seen and refuses the Renewal; one placed after waits
 * for it and joins the queue behind a Loan that is already renewed. No email
 * is sent.
 */
export async function renewLoan(deps: AppDeps, member: Identity, loanId: string): Promise<Loan> {
  const audit = createAuditLog(deps);
  return withTransaction(deps.db, async (tx) => {
    const now = deps.clock.now();
    const policy = await lockMember(tx, member.userId);
    // A Loan's Copy never changes, so this read needs no lock to say which Copy to lock.
    const seen = await tx.query<{ copy_id: string }>("select copy_id from public.loans where id = $1 and member_id = $2", [
      loanId,
      member.userId,
    ]);
    if (!seen.rows[0]) throw new AppError(404, "loan_not_found", RENEWAL_MESSAGES.loanNotFound);
    await lockCopy(tx, { id: seen.rows[0].copy_id });

    const { rows } = await tx.query<LoanRow>(`${LOAN_SELECT} where l.id = $1`, [loanId]);
    const loan = rows[0];
    // Seen just above, and the API never deletes a Loan.
    if (!loan) throw new Error(`The Loan ${loanId} was seen and then not found`);
    if (loan.returned_at !== null) throw new AppError(409, "loan_returned", RENEWAL_MESSAGES.loanReturned);

    const waiting = await booksWithWaitingHolds(tx, member.userId, [loan.book_id]);
    const renewal = renewalOf({
      loan,
      policy,
      holdWaiting: waiting.has(loan.book_id),
      // Under the Member's lock, like the Loan: a return fixing a Fine, or a settle, is wholly before or after.
      notInGoodStanding: await goodStandingRefusal(tx, member.userId, now),
      now,
    });
    if (!renewal.renewable) throw new AppError(409, renewal.reason, RENEWAL_MESSAGES.refused[renewal.reason]);

    const renewed: LoanRow = { ...loan, due_at: new Date(renewal.dueAt), renewal_count: loan.renewal_count + 1 };
    await tx.query("update public.loans set due_at = $2, renewal_count = $3 where id = $1", [
      loan.id,
      renewed.due_at,
      renewed.renewal_count,
    ]);

    // Last in the transaction: other writers of the audit log wait until it ends.
    await audit.record(
      {
        type: "loan_renewed",
        actorId: member.userId,
        subject: loan.id,
        data: {
          memberId: member.userId,
          copyId: loan.copy_id,
          bookId: loan.book_id,
          accessionNumber: loan.accession_number,
          previousDueAt: loan.due_at.toISOString(),
          dueAt: renewal.dueAt,
          renewalCount: renewed.renewal_count,
        },
      },
      tx,
    );
    // Renewed: no Hold was waiting and the Member is in Good standing.
    return toLoan({ row: renewed, policy, holdWaiting: false, notInGoodStanding: null, now });
  });
}
