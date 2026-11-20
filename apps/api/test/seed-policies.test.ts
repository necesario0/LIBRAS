import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { seedCirculationSettings } from "../src/seed/circulation.ts";
import { startTestApi } from "../src/testing/index.ts";
import type { TestApi } from "../src/testing/index.ts";

/**
 * The seeded Loan Policies: 3 Copies for 7 days (1 Renewal) for the UMAK
 * Account Types, 3 Copies for same-day in-library use (no Renewals) for Visitor
 * and Alumni, and PHP 5 a day up to PHP 300 for all Account Types.
 */
const SPEC_POLICIES = [
  { account_type: "alumni", loan_limit: 3, loan_period_days: null, in_library_only: true, renewal_limit: 0, fine_daily_rate_centavos: 500, fine_cap_centavos: 30000 },
  { account_type: "faculty", loan_limit: 3, loan_period_days: 7, in_library_only: false, renewal_limit: 1, fine_daily_rate_centavos: 500, fine_cap_centavos: 30000 },
  { account_type: "ntp_employee", loan_limit: 3, loan_period_days: 7, in_library_only: false, renewal_limit: 1, fine_daily_rate_centavos: 500, fine_cap_centavos: 30000 },
  { account_type: "umak_student", loan_limit: 3, loan_period_days: 7, in_library_only: false, renewal_limit: 1, fine_daily_rate_centavos: 500, fine_cap_centavos: 30000 },
  { account_type: "visitor", loan_limit: 3, loan_period_days: null, in_library_only: true, renewal_limit: 0, fine_daily_rate_centavos: 500, fine_cap_centavos: 30000 },
];

describe("seed script: Loan Policy and Pickup Window", () => {
  let api: TestApi;
  const policies = async () =>
    (await api.db.query("select account_type, loan_limit, loan_period_days, in_library_only, renewal_limit, fine_daily_rate_centavos, fine_cap_centavos from public.loan_policies order by account_type::text")).rows;
  const pickupWindowHours = async () =>
    (await api.db.query<{ pickup_window_hours: number }>("select pickup_window_hours from public.library_settings")).rows.map(
      (row) => row.pickup_window_hours,
    );

  before(async () => {
    api = await startTestApi();
  });
  after(async () => {
    // Whatever a test did, the database is left as the migrations made it.
    await api.db.query("delete from public.loan_policies");
    await api.db.query("delete from public.library_settings");
    await seedCirculationSettings(api.db);
    await api.close();
  });

  it("creates the Loan Policy of every Account Type and the Pickup Window setting when they are missing", async () => {
    await api.db.query("delete from public.loan_policies where account_type in ('faculty', 'visitor')");
    await api.db.query("delete from public.library_settings");

    await seedCirculationSettings(api.db);

    assert.deepEqual(await policies(), SPEC_POLICIES);
    assert.deepEqual(await pickupWindowHours(), [24]);
  });

  it("can run again, and keeps values the library has changed since (the real policy is a data change)", async () => {
    await seedCirculationSettings(api.db);
    await api.db.query("update public.loan_policies set loan_limit = 5, loan_period_days = 14 where account_type = 'faculty'");
    await api.db.query("update public.library_settings set pickup_window_hours = 48");

    await seedCirculationSettings(api.db);
    await seedCirculationSettings(api.db);

    assert.deepEqual(
      await policies(),
      SPEC_POLICIES.map((policy) => (policy.account_type === "faculty" ? { ...policy, loan_limit: 5, loan_period_days: 14 } : policy)),
    );
    assert.deepEqual(await pickupWindowHours(), [48]);
  });
});
