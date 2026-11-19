import { memberFullName } from "@libras/shared";
import type { AccountType, DeskMember } from "@libras/shared";
import type { Identity } from "../auth/auth-provider.ts";
import { withIdentity } from "../auth/identity.ts";
import type { Database } from "../db.ts";
import { clearanceOf, readStanding } from "../standing/index.ts";

interface DeskMemberRow {
  user_id: string;
  account_type: AccountType;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  loan_limit: number;
  loan_period_days: number | null;
  in_library_only: boolean;
}

/** Whose panel to build, as whom (row-level security applies to the Librarian), and the moment overdue is judged at. */
export interface DeskMemberRequest {
  db: Database;
  librarian: Identity;
  memberId: string;
  now: Date;
}

/**
 * What the desk shows about a Member: name, Account Type, Loans against the
 * Loan Policy limit and Clearance (the Loans still out and the unsettled
 * Fines), as of `now`. Read as the Librarian, so row-level security applies.
 */
export async function deskMember({ db, librarian, memberId, now }: DeskMemberRequest): Promise<DeskMember> {
  return withIdentity(db, librarian, async (scope) => {
    const { rows } = await scope.query<DeskMemberRow>(
      `select m.user_id, m.account_type, m.first_name, m.middle_name, m.last_name, p.loan_limit, p.loan_period_days, p.in_library_only
         from public.members m
         join public.loan_policies p on p.account_type = m.account_type
        where m.user_id = $1`,
      [memberId],
    );
    const row = rows[0];
    // A verified Digital ID always names an existing Member, and every Account Type has a policy.
    if (!row) throw new Error(`No Member profile or Loan Policy visible for ${memberId}`);
    const standing = await readStanding(scope, row.user_id, now);
    return {
      id: row.user_id,
      fullName: memberFullName({ firstName: row.first_name, middleName: row.middle_name, lastName: row.last_name }),
      accountType: row.account_type,
      loans: {
        current: standing.loansOut.length,
        limit: row.loan_limit,
        loanPeriodDays: row.loan_period_days,
        inLibraryOnly: row.in_library_only,
      },
      clearance: clearanceOf(standing),
    };
  });
}
