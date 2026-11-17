import { memberFullName } from "@libras/shared";
import type { AccountType, DeskFine, DeskMember } from "@libras/shared";
import type { Identity } from "../auth/auth-provider.ts";
import { withIdentity } from "../auth/identity.ts";
import type { IdentityScope as Scope } from "../auth/identity.ts";
import type { Database } from "../db.ts";

interface DeskMemberRow {
  user_id: string;
  account_type: AccountType;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  loan_limit: number;
  loan_period_days: number | null;
}

/** How many Loans the Member has out now, read as the Librarian (row-level security lets staff read Loans). */
async function currentLoanCount(scope: Scope, memberId: string): Promise<number> {
  const { rows } = await scope.query<{ count: number }>(
    "select count(*)::int as count from public.loans where member_id = $1 and returned_at is null",
    [memberId],
  );
  return rows[0]?.count ?? 0;
}

interface DeskFineRow {
  loan_id: string;
  title: string;
  accession_number: string;
  amount_centavos: number;
  days_late: number;
  fixed_at: Date;
}

/** The Member's Fines that no Librarian has settled, the earliest return first, as the Member panel lists them. */
async function unsettledFines(scope: Scope, memberId: string): Promise<DeskFine[]> {
  const { rows } = await scope.query<DeskFineRow>(
    `select f.loan_id, b.title, c.accession_number, f.amount_centavos, f.days_late, f.fixed_at
       from public.fines f
       join public.loans l on l.id = f.loan_id
       join public.copies c on c.id = l.copy_id
       join public.books b on b.id = c.book_id
      where f.member_id = $1 and f.settled_at is null
      order by f.fixed_at, f.loan_id`,
    [memberId],
  );
  return rows.map((row) => ({
    loanId: row.loan_id,
    bookTitle: row.title,
    accessionNumber: row.accession_number,
    amountCentavos: row.amount_centavos,
    daysLate: row.days_late,
    returnedAt: row.fixed_at.toISOString(),
  }));
}

/**
 * What the desk shows about a Member: name, Account Type, Loans against the
 * Loan Policy limit and unsettled Fines. Read as the Librarian, so row-level
 * security applies.
 */
export async function deskMember(db: Database, librarian: Identity, memberId: string): Promise<DeskMember> {
  return withIdentity(db, librarian, async (scope) => {
    const { rows } = await scope.query<DeskMemberRow>(
      `select m.user_id, m.account_type, m.first_name, m.middle_name, m.last_name, p.loan_limit, p.loan_period_days
         from public.members m
         join public.loan_policies p on p.account_type = m.account_type
        where m.user_id = $1`,
      [memberId],
    );
    const row = rows[0];
    // A verified Digital ID always names an existing Member, and every Account Type has a policy.
    if (!row) throw new Error(`No Member profile or Loan Policy visible for ${memberId}`);
    return {
      id: row.user_id,
      fullName: memberFullName({ firstName: row.first_name, middleName: row.middle_name, lastName: row.last_name }),
      accountType: row.account_type,
      loans: {
        current: await currentLoanCount(scope, row.user_id),
        limit: row.loan_limit,
        loanPeriodDays: row.loan_period_days,
      },
      unsettledFines: await unsettledFines(scope, row.user_id),
    };
  });
}
