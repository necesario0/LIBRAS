import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { seedCirculationSettings } from "../src/seed/circulation.ts";
import { startTestApi } from "../src/testing/index.ts";
import type { TestApi } from "../src/testing/index.ts";

/** The placeholders of spec #2: 3 Copies for 7 days for the UMAK Account Types, none for Visitor and Alumni. */
const SPEC_POLICIES = [
  { account_type: "alumni", loan_limit: 0, loan_period_days: null },
  { account_type: "faculty", loan_limit: 3, loan_period_days: 7 },
  { account_type: "ntp_employee", loan_limit: 3, loan_period_days: 7 },
  { account_type: "umak_student", loan_limit: 3, loan_period_days: 7 },
  { account_type: "visitor", loan_limit: 0, loan_period_days: null },
];

describe("seed script: Loan Policy and Pickup Window", () => {
  let api: TestApi;
  const policies = async () =>
    (await api.db.query("select account_type, loan_limit, loan_period_days from public.loan_policies order by account_type::text")).rows;
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
