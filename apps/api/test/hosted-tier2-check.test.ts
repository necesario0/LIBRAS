import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import type { MyLoansResponse } from "@libras/shared";
import { TEST_BOOK_TITLE, TEST_EMAIL_PREFIX, TIER2_STEPS, backdateLoan, checkTier2, cleanupHostedChecks } from "../scripts/hosted-checks.ts";
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

/**
 * `npm run verify:hosted -- backdate <barcode> <days>`: the demo on real phones needs a Loan that is overdue (to
 * return it late) or due tomorrow (for the due-tomorrow notice) without waiting a week.
 */
describe("Backdating a Loan for the demo on the hosted system", () => {
  let api: TestApi;

  const send = async (method: string, path: string, token: string, body?: unknown) =>
    fetch(`${api.baseUrl}${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "content-type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  before(async () => {
    api = await startTestApi();
  });
  after(async () => {
    await cleanupHostedChecks(api.db);
    await api.close();
  });

  /** Lends a fresh test Copy, on 12 Nov 2026 in Manila, to a new Member with this address. */
  const lendToMember = async (email: string) => {
    const member = await createTestMember(api, { email });
    const librarian = await createTestAccount(api, { staff: { role: "librarian", fullName: "Lita Reyes" } });
    const signedIn = await fetch(`${api.baseUrl}/staff/sign-in`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: librarian.email, password: librarian.password }),
    });
    const librarianToken = ((await signedIn.json()) as { session: { accessToken: string } }).session.accessToken;
    const book = await api.db.query<{ id: string }>("insert into public.books (title, authors) values ($1, '{}') returning id", [`${TEST_BOOK_TITLE} backdate`]);
    const barcode = `99${randomUUID().replace(/\D/g, "").slice(0, 8).padEnd(8, "0")}`;
    await api.db.query("insert into public.copies (book_id, accession_number, barcode) values ($1, $2, $3)", [book.rows[0]?.id, `HC-BD-${randomUUID().slice(0, 8)}`, barcode]);
    api.clock.set("2026-11-12T02:00:00.000Z");
    const code = ((await (await send("GET", "/members/me/digital-id", member.accessToken)).json()) as { code: string }).code;
    const identified = (await (await send("POST", "/desk/members/identify", librarianToken, { code })).json()) as { deskSession: { token: string } };
    assert.equal((await send("POST", "/desk/loans", librarianToken, { deskSession: identified.deskSession.token, copy: barcode })).status, 201);
    return { member, barcode };
  };
  const backdateEntries = async (memberId: string) =>
    (await createAuditLog(api).entries({ limit: 100_000 })).filter((entry) => entry.type === "loan_backdated" && entry.data.memberId === memberId);

  it("moves the open Loan of a Copy back by whole days, so that a seven-day Loan lent ten days ago is three days late with its Fine so far", async () => {
    const { member, barcode } = await lendToMember(`${TEST_EMAIL_PREFIX}backdate-${randomUUID().slice(0, 8)}@umak.edu.ph`);

    const moved = await backdateLoan({ ...api, barcode, days: 10 });

    // Lent on 12 Nov in Manila and due at the end of 19 Nov; ten days back, due at the end of 9 Nov.
    assert.equal(moved.dueAt, "2026-11-09T15:59:59.999Z");
    const { loans } = (await (await send("GET", "/members/me/loans", member.accessToken)).json()) as MyLoansResponse;
    assert.equal(loans[0]?.overdue, true);
    assert.equal(loans[0]?.fine?.daysLate, 3);
    assert.equal(loans[0]?.fine?.amountCentavos, 1500);
  });

  it("records each move in the audit log, with the due date before and after", async () => {
    const { member, barcode } = await lendToMember(`${TEST_EMAIL_PREFIX}backdate-${randomUUID().slice(0, 8)}@umak.edu.ph`);

    await backdateLoan({ ...api, barcode, days: 6 });

    const { loans } = (await (await send("GET", "/members/me/loans", member.accessToken)).json()) as MyLoansResponse;
    const entries = await backdateEntries(member.member.id);
    assert.deepEqual(
      entries.map((entry) => ({ actorId: entry.actorId, subject: entry.subject, data: entry.data })),
      [
        {
          actorId: null,
          subject: loans[0]?.id,
          data: { memberId: member.member.id, barcode, days: 6, previousDueAt: "2026-11-19T15:59:59.999Z", dueAt: "2026-11-13T15:59:59.999Z" },
        },
      ],
    );
    assert.equal((await createAuditLog(api).verify()).intact, true);
  });

  it("moves a Loan of a test Member whose address is the developer's +alias", async () => {
    const { barcode } = await lendToMember(`developer+${TEST_EMAIL_PREFIX}demo-${randomUUID().slice(0, 8)}@umak.edu.ph`);

    assert.equal((await backdateLoan({ ...api, barcode, days: 6 })).dueAt, "2026-11-13T15:59:59.999Z");
  });

  it("refuses the Loan of a real Member: it changes nothing and records nothing", async () => {
    const { member, barcode } = await lendToMember(`real-${randomUUID().slice(0, 8)}@umak.edu.ph`);

    await assert.rejects(
      backdateLoan({ ...api, barcode, days: 10 }),
      new RegExp(`The Loan of Copy ${barcode} belongs to a Member who is not a test Member`),
    );

    const { loans } = (await (await send("GET", "/members/me/loans", member.accessToken)).json()) as MyLoansResponse;
    assert.equal(loans[0]?.dueAt, "2026-11-19T15:59:59.999Z");
    assert.deepEqual(await backdateEntries(member.member.id), []);
    await api.db.query("delete from public.loans where member_id = $1", [member.member.id]);
  });

  it("refuses a barcode with no open Loan and a number of days that is not a whole number from 1 to 60", async () => {
    await assert.rejects(backdateLoan({ ...api, barcode: "9999999999", days: 3 }), /No Loan is open for the Copy with barcode 9999999999/);
    for (const days of [0, -1, 1.5, 61]) await assert.rejects(backdateLoan({ ...api, barcode: "9999999999", days }), /whole number of days from 1 to 60/);
  });
});
