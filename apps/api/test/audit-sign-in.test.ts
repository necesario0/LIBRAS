import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createAuditLog } from "../src/audit/index.ts";
import type { AuditEntry, AuditLog } from "../src/audit/index.ts";
import { createTestAccount, createTestMember, startTestApi, studentSignUpBody } from "../src/testing/index.ts";
import type { TestApi, TestMember } from "../src/testing/index.ts";

function post(api: TestApi, path: string, body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return fetch(`${api.baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

/** A client address of its own, read from X-Forwarded-For because the test API trusts one proxy. */
let nextAddress = 10;
const newAddress = () => `198.51.100.${nextAddress++}`;

describe("failed sign-ins are recorded in the audit log", () => {
  let api: TestApi;
  let audit: AuditLog;
  let member: TestMember;

  before(async () => {
    api = await startTestApi({ trustProxy: 1, signInLimit: { maxFailures: 3, windowMinutes: 15 } });
    audit = createAuditLog({ db: api.db, clock: api.clock });
    member = await createTestMember(api);
  });
  after(() => api.close());

  /** Runs `act` and returns the audit entries it added. */
  async function entriesAddedBy(act: () => Promise<unknown>): Promise<AuditEntry[]> {
    const before = await audit.newest();
    await act();
    return audit.entries({ afterSeq: before?.seq ?? 0 });
  }

  it("records a Member's wrong password with the email, the reason, the address and the time", async () => {
    api.clock.set("2026-11-24T08:15:30.123Z");
    const address = newAddress();

    const added = await entriesAddedBy(async () => {
      const response = await post(api, "/members/sign-in", { email: member.email, password: "wrong-pass-1" }, { "x-forwarded-for": address });
      assert.equal(response.status, 401);
    });

    assert.equal(added.length, 1);
    const [entry] = added;
    assert.equal(entry?.type, "sign_in_failed");
    assert.equal(entry?.occurredAt.toISOString(), "2026-11-24T08:15:30.123Z");
    assert.equal(entry?.subject, member.email);
    assert.equal(entry?.actorId, null);
    assert.deepEqual(entry?.data, { portal: "member", reason: "invalid_credentials", clientAddress: address });
  });

  it("records each kind of refusal on both sign-in pages, and never the password", async () => {
    const unverified = studentSignUpBody();
    assert.equal((await post(api, "/members/sign-up", unverified)).status, 201);
    const librarian = await createTestAccount(api, { staff: { role: "librarian", fullName: "Lita Reyes" } });
    const passwords = [unverified.password, librarian.password, member.password, "wrong-pass-2"];

    const attempts = [
      { path: "/members/sign-in", email: unverified.email, password: unverified.password, status: 403 },
      { path: "/members/sign-in", email: librarian.email.toUpperCase(), password: librarian.password, status: 403 },
      { path: "/staff/sign-in", email: member.email, password: member.password, status: 403 },
      { path: "/staff/sign-in", email: librarian.email, password: "wrong-pass-2", status: 401 },
    ];
    const added = await entriesAddedBy(async () => {
      for (const { path, email, password, status } of attempts) {
        const response = await post(api, path, { email, password }, { "x-forwarded-for": newAddress() });
        assert.equal(response.status, status, `${path} ${email}`);
      }
    });

    assert.deepEqual(
      added.map((entry) => [entry.subject, entry.data.portal, entry.data.reason]),
      [
        [unverified.email, "member", "email_not_verified"],
        [librarian.email, "member", "not_member"],
        [member.email, "staff", "not_staff"],
        [librarian.email, "staff", "invalid_credentials"],
      ],
    );
    const stored = JSON.stringify(added);
    for (const password of passwords) assert.ok(!stored.includes(password), "a password reached the audit log");
  });

  it("does not record a password typed into the email field", async () => {
    const typedPassword = "my secret pass 2026";

    const added = await entriesAddedBy(async () => {
      const response = await post(api, "/members/sign-in", { email: typedPassword, password: typedPassword }, {
        "x-forwarded-for": newAddress(),
      });
      assert.equal(response.status, 401);
    });

    assert.equal(added.length, 1);
    assert.equal(added[0]?.subject, null);
    assert.ok(!JSON.stringify(added).includes(typedPassword));
  });

  it("records nothing for a successful sign-in or a request refused before the password is checked", async () => {
    const blockedAddress = newAddress();
    for (let i = 0; i < 3; i++) {
      await post(api, "/members/sign-in", { email: member.email, password: "wrong-pass-3" }, { "x-forwarded-for": blockedAddress });
    }

    const added = await entriesAddedBy(async () => {
      const ok = await post(api, "/members/sign-in", { email: member.email, password: member.password }, { "x-forwarded-for": newAddress() });
      assert.equal(ok.status, 200);
      const blocked = await post(api, "/members/sign-in", { email: member.email, password: "wrong-pass-3" }, {
        "x-forwarded-for": blockedAddress,
      });
      assert.equal(blocked.status, 429);
      const malformed = await post(api, "/members/sign-in", { email: member.email }, { "x-forwarded-for": newAddress() });
      assert.equal(malformed.status, 400);
    });

    assert.deepEqual(added, []);
  });

  it("keeps the chain intact across recorded sign-ins", async () => {
    const verification = await audit.verify();
    assert.equal(verification.intact, true, JSON.stringify(verification));
  });
});
