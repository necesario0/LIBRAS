import type { AccountType } from "@libras/shared";
import type { Tx } from "../db.ts";
import type { FinePolicy } from "../fines/index.ts";

/** A Member and the Loan Policy of their Account Type. */
export interface MemberPolicyRow extends FinePolicy {
  user_id: string;
  account_type: AccountType;
  loan_limit: number;
  loan_period_days: number | null;
  renewal_limit: number;
}

/**
 * The Member and their Loan Policy, with the Member's row locked until the
 * transaction ends: confirmations, returns and Renewals for one Member run one
 * after another, so two at once cannot both pass the limit, and a Renewal never
 * sees a Loan that a return is closing at that moment. The lock does not block
 * anything that only refers to the Member (a Hold being placed, for example).
 * Every writer that needs both takes this lock before the Copy's.
 */
export async function lockMember(tx: Tx, memberId: string): Promise<MemberPolicyRow> {
  const { rows } = await tx.query<MemberPolicyRow>(
    `select m.user_id, m.account_type, p.loan_limit, p.loan_period_days, p.renewal_limit,
            p.fine_daily_rate_centavos, p.fine_cap_centavos
       from public.members m
       join public.loan_policies p on p.account_type = m.account_type
      where m.user_id = $1
        for no key update of m`,
    [memberId],
  );
  // A desk session or a signed-in Member always names an existing Member, and every Account Type has a policy.
  if (!rows[0]) throw new Error(`No Member or Loan Policy for ${memberId}`);
  return rows[0];
}
