import type pg from "pg";
import { LOAN_MESSAGES, RETURN_MESSAGES, isLoanOverdue, loanDueAt } from "@libras/shared";
import type { AccountType, DeskLoan, Loan, MyLoansResponse, ReturnedLoan } from "@libras/shared";
import type { AppDeps } from "../app.ts";
import { createAuditLog } from "../audit/index.ts";
import type { Identity } from "../auth/auth-provider.ts";
import { withIdentity } from "../auth/identity.ts";
import { withTransaction } from "../db.ts";
import { verifyDigitalId } from "../digital-id/index.ts";
import type { VerifiedDigitalId } from "../digital-id/index.ts";
import { AppError } from "../errors.ts";

/** The client of the confirmation's transaction, running as the API itself. */
type Tx = pg.PoolClient;

/** PostgreSQL's code for a unique index refusing a row. */
const UNIQUE_VIOLATION = "23505";

interface BorrowerRow {
  user_id: string;
  account_type: AccountType;
  loan_limit: number;
  loan_period_days: number | null;
}

interface CopyRow {
  id: string;
  book_id: string;
  accession_number: string;
  status: "available" | "on_loan" | "set_aside";
  title: string;
}

/**
 * The Member and their Loan Policy, with the Member's row locked until the
 * transaction ends: confirmations for one Member run one after another, so two
 * at once cannot both pass the limit. The lock does not block anything that
 * only refers to the Member (a Hold being placed, for example).
 */
async function lockBorrower(tx: Tx, memberId: string): Promise<BorrowerRow> {
  const { rows } = await tx.query<BorrowerRow>(
    `select m.user_id, m.account_type, p.loan_limit, p.loan_period_days
       from public.members m
       join public.loan_policies p on p.account_type = m.account_type
      where m.user_id = $1
        for no key update of m`,
    [memberId],
  );
  // A verified Digital ID always names an existing Member, and every Account Type has a policy.
  if (!rows[0]) throw new Error(`No Member or Loan Policy for ${memberId}`);
  return rows[0];
}

/** Which Copy a scan names: the barcode, or the accession number typed by hand in either case. `$1` is the scan. */
const COPY_MATCH = "(c.barcode = $1 or c.accession_number = $1 or c.accession_number = upper($1))";
/** A barcode match wins over an accession number match, and an exact one over an upper-cased one. */
const COPY_ORDER = "(c.barcode = $1) desc, (c.accession_number = $1) desc";

/**
 * The Copy a scan names, by its barcode or (typed by hand, in either case) its
 * accession number, with its row locked until the transaction ends: two
 * confirmations of one Copy run one after another, and the second sees the
 * status the first one left.
 */
async function lockCopy(tx: Tx, code: string): Promise<CopyRow | undefined> {
  const { rows } = await tx.query<CopyRow>(
    `select c.id, c.book_id, c.accession_number, c.status, b.title
       from public.copies c
       join public.books b on b.id = c.book_id
      where ${COPY_MATCH}
      order by ${COPY_ORDER}
      limit 1
        for no key update of c`,
    [code],
  );
  return rows[0];
}

/**
 * Marks the shown Digital ID code as used at this Librarian's desk (ADR 0004:
 * a Member and a window name one shown code). The Librarian who first confirms
 * a Loan with a code may confirm more with it while it is still accepted; the
 * same code at any other desk is refused. Nothing is kept when the Loan is
 * refused, because the transaction rolls back.
 */
async function useDigitalId(tx: Tx, verified: VerifiedDigitalId, librarianId: string, usedAt: Date): Promise<void> {
  await tx.query(
    `insert into public.digital_id_uses (member_id, code_window, librarian_id, first_used_at)
     values ($1, $2, $3, $4)
     on conflict (member_id, code_window) do nothing`,
    [verified.memberId, verified.window, librarianId, usedAt],
  );
  const { rows } = await tx.query<{ librarian_id: string }>(
    "select librarian_id from public.digital_id_uses where member_id = $1 and code_window = $2",
    [verified.memberId, verified.window],
  );
  if (rows[0]?.librarian_id !== librarianId) throw new AppError(409, "digital_id_used", LOAN_MESSAGES.digitalIdUsed);
}

/**
 * Why this Copy cannot go out to this Member, or undefined when it can.
 *
 * SEAM for Hold dispatch (#18): a Copy that is `set_aside` is refused to every
 * Member here, because nothing records yet whose Hold it is set aside for. When
 * dispatch stores the Copy on the ready Hold, let the Member of that Hold
 * through in the `set_aside` case (and mark their Hold fulfilled in the same
 * transaction); every other Member keeps getting `copy_set_aside`.
 */
function copyRefusal(copy: CopyRow, _borrower: BorrowerRow): AppError | undefined {
  if (copy.status === "on_loan") return new AppError(409, "copy_on_loan", LOAN_MESSAGES.copyOnLoan);
  if (copy.status === "set_aside") return new AppError(409, "copy_set_aside", LOAN_MESSAGES.copySetAside);
  return undefined;
}

export interface ConfirmedLoan {
  loan: DeskLoan;
  memberId: string;
}

/**
 * A Librarian confirms a Loan: the Member's Digital ID as scanned, then the
 * Copy. This is the only way a Loan comes to exist. It is refused, with a
 * reason the desk page shows, when the Digital ID is not accepted, when no Copy
 * has that barcode or accession number, when the Member's Account Type cannot
 * borrow, when the Member is at their loan limit, and when the Copy is already
 * on Loan or set aside for a Hold.
 *
 * One transaction locks the Member, then the Copy, checks both, writes the
 * Loan, marks the Copy `on_loan` (so the live count of available Copies falls)
 * and records the audit entry last. Requests at the same moment for the same
 * Copy, or for the same Member's last allowed Loan, yield exactly one Loan.
 */
export async function confirmLoan(
  deps: AppDeps,
  librarian: Identity,
  request: { digitalId: string; copy: string },
): Promise<ConfirmedLoan> {
  const verified = await verifyDigitalId(deps, request.digitalId);
  const checkedOutAt = deps.clock.now();
  const audit = createAuditLog(deps);

  try {
    return await withTransaction(deps.db, async (tx) => {
      const borrower = await lockBorrower(tx, verified.memberId);
      await useDigitalId(tx, verified, librarian.userId, checkedOutAt);

      const copy = await lockCopy(tx, request.copy);
      if (!copy) throw new AppError(404, "copy_not_found", LOAN_MESSAGES.copyNotFound);
      if (borrower.loan_limit === 0 || borrower.loan_period_days === null) {
        throw new AppError(403, "cannot_borrow", LOAN_MESSAGES.cannotBorrow);
      }
      const open = await tx.query<{ count: number }>(
        "select count(*)::int as count from public.loans where member_id = $1 and returned_at is null",
        [borrower.user_id],
      );
      if ((open.rows[0]?.count ?? 0) >= borrower.loan_limit) {
        throw new AppError(409, "loan_limit_reached", LOAN_MESSAGES.limitReached);
      }
      const refused = copyRefusal(copy, borrower);
      if (refused) throw refused;

      const dueAt = loanDueAt(checkedOutAt, borrower.loan_period_days);
      const inserted = await tx.query<{ id: string }>(
        `insert into public.loans (copy_id, member_id, confirmed_by, checked_out_at, due_at)
         values ($1, $2, $3, $4, $5)
         returning id`,
        [copy.id, borrower.user_id, librarian.userId, checkedOutAt, dueAt],
      );
      const id = (inserted.rows[0] as { id: string }).id;
      await tx.query("update public.copies set status = 'on_loan' where id = $1", [copy.id]);

      // Last in the transaction: other writers of the audit log wait until it ends.
      await audit.record(
        {
          type: "loan_confirmed",
          actorId: librarian.userId,
          subject: id,
          data: {
            memberId: borrower.user_id,
            copyId: copy.id,
            bookId: copy.book_id,
            accessionNumber: copy.accession_number,
            dueAt: dueAt.toISOString(),
          },
        },
        tx,
      );

      return {
        memberId: borrower.user_id,
        loan: {
          id,
          bookTitle: copy.title,
          accessionNumber: copy.accession_number,
          checkedOutAt: checkedOutAt.toISOString(),
          dueAt: dueAt.toISOString(),
        },
      };
    });
  } catch (error) {
    // The Copy lock makes this unreachable; the unique index is the database's own word on it.
    const violation = error as { code?: string; constraint?: string };
    if (violation.code === UNIQUE_VIOLATION && violation.constraint === "loans_one_open_per_copy") {
      throw new AppError(409, "copy_on_loan", LOAN_MESSAGES.copyOnLoan);
    }
    throw error;
  }
}

/** The Member's name as the desk writes it: first, middle and last. */
const MEMBER_NAME_SQL = "concat_ws(' ', nullif(m.first_name, ''), nullif(m.middle_name, ''), nullif(m.last_name, ''))";

/** Thrown inside the return's transaction to roll it back and look the Copy up again. */
class CopyChangedHands extends Error {}

/** How many times a return looks again when the Copy changed hands while the transaction waited for its locks. */
const RETURN_ATTEMPTS = 3;

interface OpenLoanRow {
  id: string;
  member_id: string;
  member_name: string;
  checked_out_at: Date;
  due_at: Date;
}

/**
 * SEAM for Hold dispatch (#18). A Copy has just come back and its Loan is
 * closed. This runs inside the return's transaction, with the Member's row and
 * the Copy's row locked (in that order). Today the Copy simply becomes
 * available. Dispatch looks for the Book's next Hold here and either sets the
 * Copy aside for that Hold's Member (status `set_aside`, the Pickup Window, its
 * own audit entry, the email) or, with none waiting, frees it as below. It runs
 * before the return's own audit entry, which is recorded last in the transaction.
 */
async function placeReturnedCopy(tx: Tx, copy: CopyRow): Promise<void> {
  await tx.query("update public.copies set status = 'available' where id = $1", [copy.id]);
}

/**
 * A Librarian records the return of a Copy: its barcode or accession number as
 * scanned or typed, with no Member involved. The Copy's open Loan is closed,
 * the Copy goes back on the shelf (`placeReturnedCopy`) and the audit log gets
 * a `copy_returned` entry, all in one transaction. It is refused, with a reason
 * the desk page shows, when no Copy has that code and when the Copy is not on
 * Loan (including a Copy that was returned a moment ago).
 *
 * The locks are taken in the order every writer uses, the Member's row and then
 * the Copy's row, although the scan names only the Copy: an unlocked read finds
 * who has it out, then both rows are locked and the Loan is read again. Two
 * returns of one Copy at the same moment run one after another, and the second
 * finds no open Loan: exactly one return and one audit entry.
 */
export async function recordReturn(deps: AppDeps, librarian: Identity, request: { copy: string }): Promise<ReturnedLoan> {
  const audit = createAuditLog(deps);
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await withTransaction(deps.db, async (tx) => {
        const returnedAt = deps.clock.now();
        const holder = await tx.query<{ member_id: string | null }>(
          `select l.member_id
             from public.copies c
             left join public.loans l on l.copy_id = c.id and l.returned_at is null
            where ${COPY_MATCH}
            order by ${COPY_ORDER}
            limit 1`,
          [request.copy],
        );
        if (!holder.rows[0]) throw new AppError(404, "copy_not_found", RETURN_MESSAGES.copyNotFound);
        const holderId = holder.rows[0].member_id;
        if (holderId === null) throw new AppError(409, "copy_not_on_loan", RETURN_MESSAGES.copyNotOnLoan);

        await lockBorrower(tx, holderId);
        const copy = await lockCopy(tx, request.copy);
        if (!copy) throw new AppError(404, "copy_not_found", RETURN_MESSAGES.copyNotFound);
        const open = await tx.query<OpenLoanRow>(
          `select l.id, l.member_id, ${MEMBER_NAME_SQL} as member_name, l.checked_out_at, l.due_at
             from public.loans l
             join public.members m on m.user_id = l.member_id
            where l.copy_id = $1 and l.returned_at is null`,
          [copy.id],
        );
        const loan = open.rows[0];
        // Someone else's return got here first.
        if (!loan) throw new AppError(409, "copy_not_on_loan", RETURN_MESSAGES.copyNotOnLoan);
        // Returned and lent to another Member while this waited: the Member locked is not the holder.
        if (loan.member_id !== holderId) throw new CopyChangedHands();

        const closed = await tx.query("update public.loans set returned_at = $2 where id = $1 and returned_at is null", [loan.id, returnedAt]);
        if (closed.rowCount !== 1) throw new AppError(409, "copy_not_on_loan", RETURN_MESSAGES.copyNotOnLoan);
        await placeReturnedCopy(tx, copy);

        const late = isLoanOverdue(loan.due_at, returnedAt);
        // Last in the transaction: other writers of the audit log wait until it ends.
        await audit.record(
          {
            type: "copy_returned",
            actorId: librarian.userId,
            subject: loan.id,
            data: {
              memberId: loan.member_id,
              copyId: copy.id,
              bookId: copy.book_id,
              accessionNumber: copy.accession_number,
              returnedAt: returnedAt.toISOString(),
              late,
            },
          },
          tx,
        );

        return {
          id: loan.id,
          bookTitle: copy.title,
          accessionNumber: copy.accession_number,
          memberName: loan.member_name,
          checkedOutAt: loan.checked_out_at.toISOString(),
          dueAt: loan.due_at.toISOString(),
          returnedAt: returnedAt.toISOString(),
          late,
        };
      });
    } catch (error) {
      if (!(error instanceof CopyChangedHands)) throw error;
      if (attempt >= RETURN_ATTEMPTS) throw new AppError(409, "return_conflict", RETURN_MESSAGES.changedHands);
    }
  }
}

interface LoanRow {
  id: string;
  book_id: string;
  title: string;
  authors: string[];
  accession_number: string;
  checked_out_at: Date;
  due_at: Date;
  returned_at: Date | null;
}

/**
 * The Member's own Loans: current ones first, the one due soonest at the top,
 * then past ones, the latest return first. Read as the Member, so row-level
 * security shows nobody else's. Overdue is worked out from the due date by the
 * API's clock. With them comes the loan limit of the Member's Loan Policy.
 */
export async function listLoans(deps: AppDeps, identity: Identity): Promise<MyLoansResponse> {
  const now = deps.clock.now();
  const { rows, policy } = await withIdentity(deps.db, identity, async (scope) => {
    const result = await scope.query<LoanRow>(
      `select l.id, c.book_id, b.title, b.authors, c.accession_number, l.checked_out_at, l.due_at, l.returned_at
         from public.loans l
         join public.copies c on c.id = l.copy_id
         join public.books b on b.id = c.book_id
        where l.member_id = $1
        order by (l.returned_at is null) desc,
                 case when l.returned_at is null then l.due_at end,
                 l.returned_at desc,
                 l.checked_out_at desc`,
      [identity.userId],
    );
    const policy = await scope.query<{ loan_limit: number; loan_period_days: number | null }>(
      `select p.loan_limit, p.loan_period_days
         from public.members m
         join public.loan_policies p on p.account_type = m.account_type
        where m.user_id = $1`,
      [identity.userId],
    );
    return { rows: result.rows, policy: policy.rows[0] };
  });
  const loans: Loan[] = rows.map((row) => ({
    id: row.id,
    bookId: row.book_id,
    bookTitle: row.title,
    bookAuthors: row.authors,
    accessionNumber: row.accession_number,
    checkedOutAt: row.checked_out_at.toISOString(),
    dueAt: row.due_at.toISOString(),
    returnedAt: row.returned_at === null ? null : row.returned_at.toISOString(),
    overdue: row.returned_at === null && isLoanOverdue(row.due_at, now),
  }));
  return { loans, loanLimit: policy?.loan_limit ?? 0, loanPeriodDays: policy?.loan_period_days ?? null };
}
