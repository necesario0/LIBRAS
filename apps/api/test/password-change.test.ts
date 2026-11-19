import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import { PASSWORD_CHANGE_MESSAGES, SIGN_UP_MESSAGES } from "@libras/shared";
import { createAuditLog } from "../src/audit/index.ts";
import type { AuthProvider } from "../src/auth/auth-provider.ts";
import { createTestAccount, createTestMember, startTestApi } from "../src/testing/index.ts";
import type { TestApi, TestMember } from "../src/testing/index.ts";
import { signInDirect } from "../src/testing/members.ts";
import { capturingLogger, failAuditWrites } from "./failing-audit-writes.ts";

function send(api: TestApi, method: string, path: string, body: unknown, accessToken?: string): Promise<Response> {
  return fetch(`${api.baseUrl}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

const changePassword = (api: TestApi, accessToken: string | undefined, currentPassword: string, newPassword: string) =>
  send(api, "PUT", "/members/me/password", { currentPassword, newPassword }, accessToken);

async function errorOf(response: Response): Promise<{ code: string; message: string }> {
  return ((await response.json()) as { error: { code: string; message: string } }).error;
}

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

const me = (api: TestApi, accessToken: string) =>
  fetch(`${api.baseUrl}/members/me`, { headers: { authorization: `Bearer ${accessToken}` } });

describe("Change password", () => {
  let api: TestApi;
  let member: TestMember;
  const logger = capturingLogger();

  before(async () => {
    // The sign-in limit has its own tests below, on their own API.
    api = await startTestApi({ logger, signInLimit: { maxFailures: 1000, windowMinutes: 15 } });
  });
  after(() => api.close());

  beforeEach(async () => {
    member = await createTestMember(api);
    api.emails.clear();
  });

  it("sets the new password, and ends every other session while this phone stays signed in", async () => {
    const phone = await signInPhone(api, member);
    const other = await signInPhone(api, member);
    assert.equal((await me(api, phone.accessToken)).status, 200);
    assert.equal((await me(api, other.accessToken)).status, 200);
    assert.equal((await me(api, member.accessToken)).status, 200);

    const newPassword = `new-${randomUUID()}`;
    const response = await changePassword(api, phone.accessToken, member.password, newPassword);

    assert.equal(response.status, 204);
    assert.equal((await me(api, phone.accessToken)).status, 200, "this phone stays signed in");
    assert.equal((await me(api, other.accessToken)).status, 401, "another phone is signed out");
    assert.equal((await me(api, member.accessToken)).status, 401, "so is a third session");
    const refresh = (refreshToken: string) => send(api, "POST", "/auth/refresh", { refreshToken });
    assert.equal((await refresh(other.refreshToken)).status, 401, "the other phone cannot renew its session");
    assert.equal((await refresh(phone.refreshToken)).status, 200, "this phone still renews its session");
    assert.ok(await signInDirect(member.email, newPassword), "the new password works");
    assert.equal(await signInDirect(member.email, member.password), undefined, "the old password does not");
  });

  it("writes the change to the audit log and emails a 'your password was changed' notice, without any password", async () => {
    const audit = createAuditLog(api);
    const before = (await audit.newest())?.seq ?? 0;
    const newPassword = `new-${randomUUID()}`;

    assert.equal((await changePassword(api, member.accessToken, member.password, newPassword)).status, 204);

    const entries = (await audit.entries({ afterSeq: before })).filter((entry) => entry.type === "password_changed");
    assert.equal(entries.length, 1);
    assert.equal(entries[0]?.actorId, member.member.id);
    assert.equal(entries[0]?.subject, member.member.id);
    assert.equal(entries[0]?.data.clientAddress, "127.0.0.1");
    const stored = JSON.stringify(entries);
    assert.ok(!stored.includes(newPassword) && !stored.includes(member.password), "no password reaches the audit log");
    assert.equal((await audit.verify()).intact, true);

    assert.equal(api.emails.sent.length, 1);
    const notice = api.emails.lastTo(member.email);
    assert.equal(notice?.subject, "Your LIBRAS password was changed");
    assert.match(notice.text, /changed in the app/);
    assert.match(notice.text, /Every other device/);
    assert.ok(!notice.text.includes(newPassword) && !notice.text.includes(member.password));
  });

  it("refuses a wrong current password with a clear error, and changes nothing", async () => {
    const phone = await signInPhone(api, member);
    const other = await signInPhone(api, member);

    const refused = await changePassword(api, phone.accessToken, `wrong-${randomUUID()}`, `new-${randomUUID()}`);

    assert.equal(refused.status, 403, "not 401: the app would take that for a lost session");
    const error = await errorOf(refused);
    assert.equal(error.code, "current_password_incorrect");
    assert.equal(error.message, "Current password is incorrect.");
    assert.ok(await signInDirect(member.email, member.password), "the password did not change");
    assert.equal((await me(api, phone.accessToken)).status, 200, "this phone is still signed in");
    assert.equal((await me(api, other.accessToken)).status, 200, "so is the other one");
    assert.equal(api.emails.sent.length, 0, "no notice for a change that did not happen");
  });

  it("writes a wrong current password to the audit log, with the Member and the address and no password", async () => {
    const audit = createAuditLog(api);
    const before = (await audit.newest())?.seq ?? 0;
    const wrong = `wrong-${randomUUID()}`;

    await changePassword(api, member.accessToken, wrong, `new-${randomUUID()}`);

    const entries = await audit.entries({ afterSeq: before });
    const failed = entries.filter((entry) => entry.type === "password_change_failed");
    assert.equal(failed.length, 1);
    assert.equal(failed[0]?.actorId, member.member.id);
    assert.equal(failed[0]?.subject, member.member.id);
    assert.equal(failed[0]?.data.clientAddress, "127.0.0.1");
    assert.ok(!JSON.stringify(entries).includes(wrong), "the wrong password is not recorded");
    assert.equal(entries.filter((entry) => entry.type === "password_changed").length, 0);
  });

  it("holds the new password to the sign-up rules", async () => {
    for (const [password, message] of [
      ["short", SIGN_UP_MESSAGES.passwordTooShort],
      ["x".repeat(73), SIGN_UP_MESSAGES.passwordTooLong],
    ] as const) {
      const refused = await changePassword(api, member.accessToken, member.password, password);
      assert.equal(refused.status, 400);
      const error = await errorOf(refused);
      assert.equal(error.code, "invalid_password");
      assert.equal(error.message, message);
    }
    assert.ok(await signInDirect(member.email, member.password), "nothing changed");
    assert.equal(api.emails.sent.length, 0);
  });

  it("refuses a new password that is the current one", async () => {
    const refused = await changePassword(api, member.accessToken, member.password, member.password);

    assert.equal(refused.status, 400);
    const error = await errorOf(refused);
    assert.equal(error.code, "invalid_password");
    assert.match(error.message, /different from your current password/);
    assert.equal(api.emails.sent.length, 0);
  });

  it("answers a missing current password, or a new password that is missing or not text, with invalid_request", async () => {
    for (const body of [
      { newPassword: `new-${randomUUID()}` },
      { currentPassword: member.password },
      { currentPassword: member.password, newPassword: 123456789 },
    ]) {
      const response = await send(api, "PUT", "/members/me/password", body, member.accessToken);

      assert.equal(response.status, 400, JSON.stringify(body));
      assert.deepEqual(await errorOf(response), { code: "invalid_request", message: PASSWORD_CHANGE_MESSAGES.invalidRequest }, JSON.stringify(body));
    }
  });

  it("needs a signed-in Member: no session is 401, a Librarian is 403", async () => {
    const newPassword = `new-${randomUUID()}`;
    assert.equal((await changePassword(api, undefined, member.password, newPassword)).status, 401);
    assert.equal((await changePassword(api, "not-a-token", member.password, newPassword)).status, 401);

    const librarian = await createTestAccount(api, { staff: { role: "librarian", fullName: "Lia Brarian" } });
    const librarianToken = await signInDirect(librarian.email, librarian.password);
    const refused = await changePassword(api, librarianToken, librarian.password, newPassword);
    assert.equal(refused.status, 403);
    assert.equal((await errorOf(refused)).code, "not_member");
    assert.ok(await signInDirect(librarian.email, librarian.password), "the Librarian's password is unchanged");
  });

  it("keeps the change when the audit write fails twice: the Member is told it worked, the email still goes out, and the entry is logged", async () => {
    logger.errors.length = 0;
    const undo = await failAuditWrites(api.db, "password_changed", "always");
    const newPassword = `new-${randomUUID()}`;
    try {
      const response = await changePassword(api, member.accessToken, member.password, newPassword);

      assert.equal(response.status, 204, "the password is changed, so the answer is a success");
    } finally {
      await undo();
    }
    assert.ok(await signInDirect(member.email, newPassword), "the new password works");
    assert.equal(api.emails.lastTo(member.email)?.subject, "Your LIBRAS password was changed", "the Member is still told");
    const logged = logger.errors.filter((line) => line.includes("password_changed"));
    assert.equal(logged.length, 1, logger.errors.join("\n"));
    for (const part of [member.member.id, "127.0.0.1"]) assert.ok(logged[0]?.includes(part), part);
    assert.ok(!logged[0]?.includes(newPassword) && !logged[0]?.includes(member.password), "no password is logged");
  });

  it("retries a failed audit write once, so one failure loses nothing", async () => {
    logger.errors.length = 0;
    const audit = createAuditLog(api);
    const before = (await audit.newest())?.seq ?? 0;
    const undo = await failAuditWrites(api.db, "password_changed", "once");
    try {
      assert.equal((await changePassword(api, member.accessToken, member.password, `new-${randomUUID()}`)).status, 204);
    } finally {
      await undo();
    }
    const entries = (await audit.entries({ afterSeq: before })).filter((entry) => entry.type === "password_changed");
    assert.deepEqual(entries.map((entry) => entry.subject), [member.member.id]);
    assert.deepEqual(logger.errors, []);
  });

  it("keeps the change when the email cannot be sent: the Member is told it worked and the audit entry is written", async () => {
    const audit = createAuditLog(api);
    const before = (await audit.newest())?.seq ?? 0;
    const newPassword = `new-${randomUUID()}`;
    api.emails.failing = true;
    try {
      const response = await changePassword(api, member.accessToken, member.password, newPassword);

      assert.equal(response.status, 204);
    } finally {
      api.emails.failing = false;
    }
    assert.ok(await signInDirect(member.email, newPassword));
    const entries = (await audit.entries({ afterSeq: before })).filter((entry) => entry.type === "password_changed");
    assert.equal(entries.length, 1);
  });
});

describe("Change password limit", () => {
  let api: TestApi;

  beforeEach(async () => {
    api = await startTestApi({ signInLimit: { maxFailures: 3, windowMinutes: 15 } });
  });
  afterEach(() => api.close());

  it("blocks the address after three wrong current passwords, even for the right one, until the window passes", async () => {
    const member = await createTestMember(api);
    for (let guess = 0; guess < 3; guess += 1) {
      const refused = await changePassword(api, member.accessToken, `wrong-${guess}-${randomUUID()}`, `new-${randomUUID()}`);
      assert.equal((await errorOf(refused)).code, "current_password_incorrect");
    }

    const newPassword = `new-${randomUUID()}`;
    const blocked = await changePassword(api, member.accessToken, member.password, newPassword);

    assert.equal(blocked.status, 429);
    assert.equal((await errorOf(blocked)).code, "too_many_attempts");
    assert.ok(Number(blocked.headers.get("retry-after")) > 0);
    assert.ok(await signInDirect(member.email, member.password), "the block did not change the password");

    api.clock.advance({ minutes: 15 });
    assert.equal((await changePassword(api, member.accessToken, member.password, newPassword)).status, 204);
  });

  it("shares the count with failed sign-ins: guessing here cannot get around the sign-in limit", async () => {
    const member = await createTestMember(api);
    for (let guess = 0; guess < 2; guess += 1) {
      await changePassword(api, member.accessToken, `wrong-${guess}-${randomUUID()}`, `new-${randomUUID()}`);
    }
    const badSignIn = await send(api, "POST", "/members/sign-in", { email: member.email, password: `wrong-${randomUUID()}` });
    assert.equal(badSignIn.status, 401);

    const blocked = await changePassword(api, member.accessToken, member.password, `new-${randomUUID()}`);

    assert.equal(blocked.status, 429);
  });

  it("does not count rejected input or successful changes", async () => {
    const member = await createTestMember(api);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      assert.equal((await changePassword(api, member.accessToken, member.password, "short")).status, 400);
    }
    let current = member.password;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const next = `new-${attempt}-${randomUUID()}`;
      assert.equal((await changePassword(api, member.accessToken, current, next)).status, 204);
      current = next;
    }
  });
});

describe("Change password limit: what counts", () => {
  let api: TestApi;
  /** While true, Supabase Auth says the session is gone when the new password is set: it ended after the guard checked it. */
  let sessionEnded = false;

  beforeEach(async () => {
    sessionEnded = false;
    api = await startTestApi({
      signInLimit: { maxFailures: 3, windowMinutes: 15 },
      wrapAuth: (auth): AuthProvider => ({
        signInWithPassword: (email, password) => auth.signInWithPassword(email, password),
        refresh: (refreshToken) => auth.refresh(refreshToken),
        identify: (accessToken) => auth.identify(accessToken),
        signOut: (accessToken) => auth.signOut(accessToken),
        signOutEverywhere: (accessToken) => auth.signOutEverywhere(accessToken),
        changePassword: (accessToken, newPassword) =>
          sessionEnded ? Promise.resolve(false) : auth.changePassword(accessToken, newPassword),
      }),
    });
  });
  afterEach(() => api.close());

  it("counts only a wrong current password: a session that ended after the right password is a 401 and is not counted", async () => {
    const member = await createTestMember(api);
    sessionEnded = true;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await changePassword(api, member.accessToken, member.password, `new-${attempt}-${randomUUID()}`);
      assert.equal(response.status, 401);
      assert.equal((await errorOf(response)).code, "not_signed_in");
    }

    sessionEnded = false;
    const newPassword = `new-${randomUUID()}`;
    const response = await changePassword(api, member.accessToken, member.password, newPassword);

    assert.equal(response.status, 204, "four 401s did not fill the limit of three");
    assert.ok(await signInDirect(member.email, newPassword));
  });
});
