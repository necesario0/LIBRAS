import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { DIGITAL_ID_MESSAGES } from "@libras/shared";
import type { DigitalIdResponse, IdentifyMemberResponse } from "@libras/shared";
import { withIdentity } from "../src/auth/index.ts";
import { currentDigitalId } from "../src/digital-id/index.ts";
import { createTestAccount, createTestMember, startTestApi } from "../src/testing/index.ts";
import type { TestApi, TestMember } from "../src/testing/index.ts";

function bearer(accessToken: string): Record<string, string> {
  return { authorization: `Bearer ${accessToken}` };
}

describe("Digital ID", () => {
  let api: TestApi;
  let ana: TestMember;
  let ben: TestMember;
  let librarianToken: string;

  async function digitalIdOf(member: TestMember): Promise<DigitalIdResponse> {
    const response = await fetch(`${api.baseUrl}/members/me/digital-id`, { headers: bearer(member.accessToken) });
    assert.equal(response.status, 200);
    return (await response.json()) as DigitalIdResponse;
  }

  function identify(body: unknown, accessToken = librarianToken): Promise<Response> {
    return fetch(`${api.baseUrl}/desk/members/identify`, {
      method: "POST",
      headers: { "content-type": "application/json", ...bearer(accessToken) },
      body: JSON.stringify(body),
    });
  }

  async function refusal(response: Response): Promise<{ status: number; code: string; message: string }> {
    const { error } = (await response.json()) as { error: { code: string; message: string } };
    return { status: response.status, code: error.code, message: error.message };
  }

  before(async () => {
    api = await startTestApi();
    ana = await createTestMember(api, { firstName: "Ana", middleName: "Cruz", lastName: "Santos" });
    ben = await createTestMember(api, { firstName: "Ben", lastName: "Reyes" });
    const librarian = await createTestAccount(api, { staff: { role: "librarian", fullName: "Lita Reyes" } });
    const signedIn = await fetch(`${api.baseUrl}/staff/sign-in`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: librarian.email, password: librarian.password }),
    });
    librarianToken = ((await signedIn.json()) as { session: { accessToken: string } }).session.accessToken;
  });
  after(() => api.close());

  beforeEach(() => {
    // 20 seconds into a window, so "the next window" is 40 seconds away.
    api.clock.set("2026-11-24T08:00:20.000Z");
  });

  it("gives a Member a 12-digit code with the window it belongs to, timed by the API's clock", async () => {
    const id = await digitalIdOf(ana);

    assert.match(id.code, /^[0-9]{12}$/);
    assert.equal(id.windowStartsAt, "2026-11-24T08:00:00.000Z");
    assert.equal(id.refreshAt, "2026-11-24T08:01:00.000Z");
    assert.equal(id.serverTime, "2026-11-24T08:00:20.000Z");
    // The secret behind the code is never part of the answer.
    assert.deepEqual(Object.keys(id).sort(), ["code", "refreshAt", "serverTime", "windowStartsAt"]);
  });

  it("keeps the same code for the whole window and changes it when the window passes", async () => {
    const first = await digitalIdOf(ana);
    api.clock.advance({ seconds: 39, milliseconds: 999 });
    const sameWindow = await digitalIdOf(ana);
    api.clock.advance({ milliseconds: 1 });
    const nextWindow = await digitalIdOf(ana);

    assert.equal(sameWindow.code, first.code);
    assert.notEqual(nextWindow.code, first.code);
    assert.equal(nextWindow.windowStartsAt, "2026-11-24T08:01:00.000Z");
    // The Digital ID number (the first six digits) stays; the rotating part changes.
    assert.equal(nextWindow.code.slice(0, 6), first.code.slice(0, 6));
  });

  it("gives two Members different Digital ID numbers", async () => {
    const [a, b] = await Promise.all([digitalIdOf(ana), digitalIdOf(ben)]);
    assert.notEqual(a.code.slice(0, 6), b.code.slice(0, 6));
  });

  it("identifies the Member at the desk by a code from the current window", async () => {
    const { code } = await digitalIdOf(ana);

    const response = await identify({ code });

    assert.equal(response.status, 200);
    const body = (await response.json()) as IdentifyMemberResponse;
    assert.deepEqual(body.member, {
      id: ana.member.id,
      fullName: "Ana Cruz Santos",
      accountType: "umak_student",
      loans: { current: 0, limit: 3, loanPeriodDays: 7 },
    });
  });

  it("accepts a code from the window before, to allow for the time it takes to scan", async () => {
    const { code } = await digitalIdOf(ana);
    api.clock.advance({ seconds: 99 }); // 08:01:59, the last moment of the next window

    const response = await identify({ code });

    assert.equal(response.status, 200);
    assert.equal(((await response.json()) as IdentifyMemberResponse).member.id, ana.member.id);
  });

  it("rejects a code older than that as expired, with a message the Librarian can act on", async () => {
    const { code } = await digitalIdOf(ana);

    api.clock.advance({ seconds: 100 }); // 08:02:00: two windows on
    assert.deepEqual(await refusal(await identify({ code })), {
      status: 400,
      code: "digital_id_expired",
      message: DIGITAL_ID_MESSAGES.expired,
    });

    api.clock.advance({ minutes: 30 }); // a screenshot kept for half an hour
    assert.equal((await refusal(await identify({ code }))).code, "digital_id_expired");
  });

  it("does not accept a code from a window that has not started yet", async () => {
    api.clock.advance({ minutes: 1 });
    const { code: future } = await digitalIdOf(ana);
    api.clock.advance({ minutes: -1 });

    assert.equal((await refusal(await identify({ code: future }))).code, "digital_id_invalid");
  });

  it("rejects a wrong code for a real Member, and never matches it to another Member", async () => {
    const a = await digitalIdOf(ana);
    const b = await digitalIdOf(ben);
    const wrongToken = a.code.slice(0, 6) + String((Number(a.code.slice(6)) + 1) % 1_000_000).padStart(6, "0");
    const anasNumberBensToken = a.code.slice(0, 6) + b.code.slice(6);

    for (const code of [wrongToken, anasNumberBensToken]) {
      assert.deepEqual(
        await refusal(await identify({ code })),
        { status: 400, code: "digital_id_invalid", message: DIGITAL_ID_MESSAGES.invalid },
        code,
      );
    }
  });

  it("rejects a code whose Digital ID number belongs to nobody, the same way", async () => {
    const taken = new Set(
      (await api.db.query<{ id_number: string }>("select id_number from public.digital_id_secrets")).rows.map((r) => r.id_number),
    );
    let unused = 0;
    while (taken.has(String(unused).padStart(6, "0"))) unused += 1;

    const response = await identify({ code: `${String(unused).padStart(6, "0")}123456` });

    assert.deepEqual(await refusal(response), {
      status: 400,
      code: "digital_id_invalid",
      message: DIGITAL_ID_MESSAGES.invalid,
    });
  });

  it("refuses malformed input before looking anything up", async () => {
    for (const body of [
      {},
      { code: "" },
      { code: "12345" },
      { code: "1234567890123" },
      { code: "4821 0937 5512" },
      { code: "48210937551a" },
      { code: 482109375512 },
      { code: "482109375512", extra: true },
    ]) {
      const result = await refusal(await identify(body));
      assert.equal(result.status, 400, JSON.stringify(body));
      assert.equal(result.code, "invalid_request", JSON.stringify(body));
    }
  });

  it("shows a Visitor with a limit of zero", async () => {
    const visitor = await createTestAccount(api);
    await api.db.query(
      `insert into public.members (user_id, account_type, first_name, last_name, username, terms_accepted_at)
       values ($1, 'visitor', 'Vida', 'Lim', $2, now())`,
      [visitor.userId, `vida_${visitor.userId.slice(0, 8)}`],
    );
    // A Visitor cannot reach /members/me/* until their sign-up ticket maps their profile, so the
    // code is arranged with the function behind GET /members/me/digital-id.
    const { code } = await currentDigitalId(api, visitor.userId);

    const identified = (await (await identify({ code })).json()) as IdentifyMemberResponse;

    assert.deepEqual(identified.member, {
      id: visitor.userId,
      fullName: "Vida Lim",
      accountType: "visitor",
      loans: { current: 0, limit: 0, loanPeriodDays: null },
    });
  });

  it("lets only a Librarian identify a Member, and only a Member see a Digital ID", async () => {
    const { code } = await digitalIdOf(ana);

    assert.equal((await identify({ code }, ana.accessToken)).status, 403);
    assert.equal((await identify({ code }, "not-a-token")).status, 401);
    const librarianAsMember = await fetch(`${api.baseUrl}/members/me/digital-id`, { headers: bearer(librarianToken) });
    assert.equal(librarianAsMember.status, 403);
    assert.equal((await fetch(`${api.baseUrl}/members/me/digital-id`)).status, 401);
  });

  it("keeps every Digital ID secret out of reach of Members and Librarians in PostgreSQL itself", async () => {
    await digitalIdOf(ana);
    const librarianId = (await api.db.query<{ user_id: string }>("select user_id from public.staff limit 1")).rows[0];
    assert.ok(librarianId);

    for (const identity of [
      { userId: ana.member.id, email: ana.email },
      { userId: librarianId.user_id, email: "librarian@example.com" },
    ]) {
      const outcome = await withIdentity(api.db, identity, async (scope) => {
        try {
          await scope.query("select secret from public.digital_id_secrets");
          return "allowed";
        } catch {
          return "refused";
        }
      }).catch(() => "refused");
      assert.equal(outcome, "refused", identity.userId);
    }
  });
});

describe("Loan Policy", () => {
  let api: TestApi;
  before(async () => {
    api = await startTestApi();
  });
  after(() => api.close());

  it("has a row for every Account Type, with the placeholder policy", async () => {
    const { rows } = await api.db.query(
      "select account_type, loan_limit, loan_period_days from public.loan_policies order by account_type",
    );
    assert.deepEqual(rows, [
      { account_type: "umak_student", loan_limit: 3, loan_period_days: 7 },
      { account_type: "faculty", loan_limit: 3, loan_period_days: 7 },
      { account_type: "ntp_employee", loan_limit: 3, loan_period_days: 7 },
      { account_type: "visitor", loan_limit: 0, loan_period_days: null },
      { account_type: "alumni", loan_limit: 0, loan_period_days: null },
    ]);
  });
});
