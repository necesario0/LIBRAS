import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { TEST_BOOK_TITLE, TEST_EMAIL_PREFIX, TIER2_STEPS, checkTier2, cleanupHostedChecks } from "../scripts/hosted-checks.ts";
import { createAuditLog } from "../src/audit/index.ts";
import { createTestAccount, createTestMember, startTestApi } from "../src/testing/index.ts";
import type { TestApi } from "../src/testing/index.ts";

const SWEEP_SECRET = "tier2-check-test-secret-0123456789abcdef0123456789";

/**
 * `npm run verify:hosted -- tier2` walks the Tier 2 paths through the hosted API with its own test
 * Member and test Book. Here the same walk runs against the real API on this computer.
 */
describe("The Tier 2 check of the hosted system", () => {
  let api: TestApi;
  let librarianToken = "";

  const signInLibrarian = async (): Promise<string> => {
    const account = await createTestAccount(api, { staff: { role: "librarian", fullName: "Lita Reyes" } });
    const response = await fetch(`${api.baseUrl}/staff/sign-in`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: account.email, password: account.password }),
    });
    return ((await response.json()) as { session: { accessToken: string } }).session.accessToken;
  };
  /** A fresh UMAK Student with the address the cleanup recognises. */
  const testMember = async () => {
    const member = await createTestMember(api, { email: `${TEST_EMAIL_PREFIX}tier2-${randomUUID().slice(0, 8)}@umak.edu.ph` });
    return { accessToken: member.accessToken, userId: member.member.id };
  };
  const leftovers = async () => ({
    members: (await api.db.query("select 1 from auth.users where email like $1", [`${TEST_EMAIL_PREFIX}%`])).rowCount,
    books: (await api.db.query("select 1 from public.books where title like $1", [`${TEST_BOOK_TITLE}%`])).rowCount,
    resets: (await api.db.query("select 1 from public.password_resets where email like $1", [`${TEST_EMAIL_PREFIX}%`])).rowCount,
  });

  before(async () => {
    api = await startTestApi({ sweepSecret: SWEEP_SECRET });
    librarianToken = await signInLibrarian();
    await cleanupHostedChecks(api.db);
  });
  after(async () => {
    await cleanupHostedChecks(api.db);
    await api.close();
  });

  it("walks Renewal, the Loans list, a Fine and its settlement, Clearance, the Good standing refusals, the password reset and the sweep, and finds the audit chain intact", async () => {
    const lines: string[] = [];

    const report = await checkTier2({
      apiUrl: api.baseUrl,
      db: api.db,
      librarianToken,
      member: await testMember(),
      sweepSecret: SWEEP_SECRET,
      log: (line) => lines.push(line),
    });

    assert.deepEqual(report.passed, [...TIER2_STEPS]);
    assert.equal(lines.length, TIER2_STEPS.length, lines.join("\n"));
    assert.ok(lines.every((line) => line.startsWith("ok ")), lines.join("\n"));
    // The seeded UMAK Student policy: PHP 5 a day, three days late.
    assert.equal(report.fineCentavos, 1500);
  });

  it("stops at the step the API gets wrong and names it: here the API does not take the sweep secret", async () => {
    const lines: string[] = [];

    await assert.rejects(
      checkTier2({
        apiUrl: api.baseUrl,
        db: api.db,
        librarianToken,
        member: await testMember(),
        sweepSecret: "not-the-secret-0123456789abcdef0123456789abcdef",
        log: (line) => lines.push(line),
      }),
      (error: Error) => {
        assert.match(error.message, /^The sweep endpoint/);
        assert.match(error.message, /401/);
        return true;
      },
    );
    assert.ok(lines.length > 0 && lines.length < TIER2_STEPS.length);
  });

  it("cleans up every test Member, test Book, Copy, Loan, Fine and reset request it made, and the audit log stays intact", async () => {
    await checkTier2({ apiUrl: api.baseUrl, db: api.db, librarianToken, member: await testMember(), sweepSecret: SWEEP_SECRET, log: () => {} });
    assert.notDeepEqual(await leftovers(), { members: 0, books: 0, resets: 0 });

    const removed = await cleanupHostedChecks(api.db);

    assert.ok(removed.members > 0);
    assert.deepEqual(await leftovers(), { members: 0, books: 0, resets: 0 });
    assert.equal((await createAuditLog(api).verify()).intact, true);
  });
});
