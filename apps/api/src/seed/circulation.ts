import type { AccountType } from "@libras/shared";
import type { Database } from "../db.ts";

interface SeedLoanPolicy {
  loanLimit: number;
  loanPeriodDays: number | null;
  renewalLimit: number;
  fineDailyRateCentavos: number;
  fineCapCentavos: number;
}

/**
 * The placeholder Loan Policy of spec #2: 3 Copies for 7 days for the UMAK
 * Account Types, a limit of zero (cannot borrow) for Visitor and Alumni; and of
 * spec #29: one Renewal per Loan, and a Fine of PHP 5 a day up to PHP 300 (in
 * centavos) for the Account Types that borrow. The real UMAK policy replaces
 * these as a data change.
 */
export const SEED_LOAN_POLICIES: Readonly<Record<AccountType, SeedLoanPolicy>> = {
  umak_student: { loanLimit: 3, loanPeriodDays: 7, renewalLimit: 1, fineDailyRateCentavos: 500, fineCapCentavos: 30_000 },
  faculty: { loanLimit: 3, loanPeriodDays: 7, renewalLimit: 1, fineDailyRateCentavos: 500, fineCapCentavos: 30_000 },
  ntp_employee: { loanLimit: 3, loanPeriodDays: 7, renewalLimit: 1, fineDailyRateCentavos: 500, fineCapCentavos: 30_000 },
  visitor: { loanLimit: 0, loanPeriodDays: null, renewalLimit: 1, fineDailyRateCentavos: 0, fineCapCentavos: 0 },
  alumni: { loanLimit: 0, loanPeriodDays: null, renewalLimit: 1, fineDailyRateCentavos: 0, fineCapCentavos: 0 },
};

/** The seeded Pickup Window: how long a Copy stays set aside for the Member whose Hold was chosen. */
export const SEED_PICKUP_WINDOW_HOURS = 24;

/**
 * Makes sure the Loan Policy of every Account Type and the Pickup Window
 * setting exist. The migrations create them too (the API cannot run without
 * them); this puts back any that are missing. A row that exists is kept as it
 * is, so running the seed again never undoes a policy or window the library has
 * set since. Safe to run any number of times.
 */
export async function seedCirculationSettings(db: Database): Promise<void> {
  for (const [accountType, policy] of Object.entries(SEED_LOAN_POLICIES)) {
    await db.query(
      `insert into public.loan_policies
         (account_type, loan_limit, loan_period_days, renewal_limit, fine_daily_rate_centavos, fine_cap_centavos)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (account_type) do nothing`,
      [accountType, policy.loanLimit, policy.loanPeriodDays, policy.renewalLimit, policy.fineDailyRateCentavos, policy.fineCapCentavos],
    );
  }
  await db.query(
    "insert into public.library_settings (pickup_window_hours) values ($1) on conflict (singleton) do nothing",
    [SEED_PICKUP_WINDOW_HOURS],
  );
}
