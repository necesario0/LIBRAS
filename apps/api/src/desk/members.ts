import type { AccountType, DeskMember } from "@libras/shared";
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

/**
 * What the desk shows about a Member: name, Account Type and Loans against the
 * Loan Policy limit. Read as the Librarian, so row-level security applies.
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
      fullName: [row.first_name, row.middle_name, row.last_name].filter((part) => part !== null && part !== "").join(" "),
      accountType: row.account_type,
      loans: {
        current: await currentLoanCount(scope, row.user_id),
        limit: row.loan_limit,
        loanPeriodDays: row.loan_period_days,
      },
    };
  });
}
