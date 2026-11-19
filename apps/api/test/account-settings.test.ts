import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import type { AccountType, MemberLoanPolicyResponse } from "@libras/shared";
import { createAuditLog } from "../src/audit/index.ts";
import { createTestMember, createTestMemberOfType, startTestApi } from "../src/testing/index.ts";
import type { TestApi, TestMember } from "../src/testing/index.ts";
import { capturingLogger, failAuditWrites } from "./failing-audit-writes.ts";

const send = (api: TestApi, method: string, path: string, body?: unknown, accessToken?: string) =>
  fetch(`${api.baseUrl}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

interface Phone {
  accessToken: string;
  refreshToken: string;
}

/** Signs in through the API, as the app does: a new session of the account. */
async function signInPhone(api: TestApi, member: TestMember): Promise<Phone> {
  const response = await send(api, "POST", "/members/sign-in", { email: member.email, password: member.password });
  assert.equal(response.status, 200);
  return ((await response.json()) as { session: Phone }).session;
}

const me = (api: TestApi, accessToken: string) => send(api, "GET", "/members/me", undefined, accessToken);

describe("Sign out of all devices", () => {
  const logger = capturingLogger();
  let api: TestApi;
  let member: TestMember;

  before(async () => {
    api = await startTestApi({ logger });
  });
  after(() => api.close());
  beforeEach(async () => {
    member = await createTestMember(api);
  });

  it("ends every session of the account, this phone included, and an old token is refused afterwards", async () => {
    const phone = await signInPhone(api, member);
    const other = await signInPhone(api, member);
    assert.equal((await me(api, phone.accessToken)).status, 200);
    assert.equal((await me(api, other.accessToken)).status, 200);

    const response = await send(api, "POST", "/members/me/sign-out-all", undefined, phone.accessToken);

    assert.equal(response.status, 204);
    assert.equal((await me(api, phone.accessToken)).status, 401, "this phone's token is refused");
    assert.equal((await me(api, other.accessToken)).status, 401, "so is another phone's");
    assert.equal((await me(api, member.accessToken)).status, 401, "so is a third session");
    assert.equal((await send(api, "POST", "/auth/refresh", { refreshToken: phone.refreshToken })).status, 401, "this phone cannot renew");
    assert.equal((await send(api, "POST", "/auth/refresh", { refreshToken: other.refreshToken })).status, 401, "nor can the other");
    const again = await signInPhone(api, member);
    assert.equal((await me(api, again.accessToken)).status, 200, "the Member can sign in again with the same password");
  });

  it("writes it to the audit log, with the Member as actor and subject", async () => {
    const audit = createAuditLog(api);
    const before = (await audit.newest())?.seq ?? 0;

    assert.equal((await send(api, "POST", "/members/me/sign-out-all", undefined, member.accessToken)).status, 204);

    const entries = (await audit.entries({ afterSeq: before })).filter((entry) => entry.type === "signed_out_all_devices");
    assert.equal(entries.length, 1);
    assert.equal(entries[0]?.actorId, member.member.id);
    assert.equal(entries[0]?.subject, member.member.id);
    assert.equal(entries[0]?.data.clientAddress, "127.0.0.1");
    assert.equal((await audit.verify()).intact, true);
  });

  it("needs a signed-in Member", async () => {
    assert.equal((await send(api, "POST", "/members/me/sign-out-all")).status, 401);
    assert.equal((await send(api, "POST", "/members/me/sign-out-all", undefined, "not-a-token")).status, 401);
  });

  it("still ends the sessions when the audit write fails, and logs the entry to add by hand", async () => {
    const undo = await failAuditWrites(api.db, "signed_out_all_devices", "always");
    try {
      const response = await send(api, "POST", "/members/me/sign-out-all", undefined, member.accessToken);
      assert.equal(response.status, 204);
      assert.equal((await me(api, member.accessToken)).status, 401);
      assert.ok(logger.errors.some((line) => line.includes("signed_out_all_devices")));
    } finally {
      await undo();
    }
  });
});

describe("My Loan Policy", () => {
  let api: TestApi;

  before(async () => {
    api = await startTestApi();
  });
  after(() => api.close());

  const policyOf = async (member: TestMember): Promise<MemberLoanPolicyResponse> => {
    const response = await send(api, "GET", "/members/me/loan-policy", undefined, member.accessToken);
    assert.equal(response.status, 200, await response.clone().text());
    return (await response.json()) as MemberLoanPolicyResponse;
  };

  it("gives a UMAK Student the seeded Loan Policy numbers", async () => {
    const policy = await policyOf(await createTestMember(api));
    assert.deepEqual(policy, {
      accountType: "umak_student",
      loanLimit: 3,
      loanPeriodDays: 7,
      inLibraryOnly: false,
      renewalLimit: 1,
      fineDailyRateCentavos: 500,
      fineCapCentavos: 30_000,
    });
  });

  for (const accountType of ["faculty", "ntp_employee"] as const satisfies AccountType[]) {
    it(`gives ${accountType} a Member who can borrow`, async () => {
      const policy = await policyOf(await createTestMemberOfType(api, accountType));
      assert.equal(policy.accountType, accountType);
      assert.equal(policy.loanLimit, 3);
    });
  }

  for (const accountType of ["visitor", "alumni"] as const satisfies AccountType[]) {
    it(`gives ${accountType} an in-library-only Loan Policy of 3 books with no multi-day loan period`, async () => {
      const policy = await policyOf(await createTestMemberOfType(api, accountType));
      assert.deepEqual(policy, {
        accountType,
        loanLimit: 3,
        loanPeriodDays: null,
        inLibraryOnly: true,
        renewalLimit: 0,
        fineDailyRateCentavos: 500,
        fineCapCentavos: 30_000,
      });
    });
  }

  it("reads what the library has set, not a constant", async () => {
    const student = await createTestMember(api);
    await api.db.query("update public.loan_policies set loan_period_days = 14 where account_type = 'umak_student'");
    try {
      assert.equal((await policyOf(student)).loanPeriodDays, 14);
    } finally {
      await api.db.query("update public.loan_policies set loan_period_days = 7 where account_type = 'umak_student'");
    }
  });

  it("needs a signed-in Member", async () => {
    assert.equal((await send(api, "GET", "/members/me/loan-policy")).status, 401);
  });
});
