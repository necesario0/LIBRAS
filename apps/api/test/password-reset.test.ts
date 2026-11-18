import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import { PASSWORD_RESET_MESSAGES, SIGN_UP_MESSAGES } from "@libras/shared";
import { createAuditLog } from "../src/audit/index.ts";
import { createTestAccount, createTestMember, startTestApi } from "../src/testing/index.ts";
import type { TestApi, TestMember } from "../src/testing/index.ts";
import { codeFromEmail, signInDirect } from "../src/testing/members.ts";
import { capturingLogger, failAuditWrites } from "./failing-audit-writes.ts";

const CODE_LIFETIME_MS = 10 * 60 * 1000;

function postJson(api: TestApi, path: string, body: unknown, accessToken?: string): Promise<Response> {
  return fetch(`${api.baseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

const requestCode = (api: TestApi, email: string) => postJson(api, "/members/password-reset", { email });
const checkCode = (api: TestApi, email: string, code: string) => postJson(api, "/members/password-reset/check", { email, code });
const completeReset = (api: TestApi, email: string, code: string, password: string) =>
  postJson(api, "/members/password-reset/complete", { email, code, password });

async function errorCode(response: Response): Promise<string> {
  return ((await response.json()) as { error: { code: string } }).error.code;
}

/** A code that is not `code`, so a test can be sure its guess is wrong. */
function wrongCode(code: string): string {
  return code === "000000" ? "111111" : "000000";
}

/** Requests a reset code for the Member and reads it from the captured email. */
async function emailedCode(api: TestApi, email: string): Promise<string> {
  api.emails.clear();
  const response = await requestCode(api, email);
  assert.equal(response.status, 200);
  return codeFromEmail(api.emails.lastTo(email));
}

describe("Forgot password", () => {
  let api: TestApi;
  let member: TestMember;

  before(async () => {
    // The limits have their own tests below, on their own API.
    api = await startTestApi({
      passwordResetLimit: {
        perClientAddress: { maxRequests: 1000, windowMinutes: 15 },
        perEmail: { maxRequests: 1000, windowMinutes: 15 },
      },
    });
  });
  after(() => api.close());

  beforeEach(async () => {
    member = await createTestMember(api);
    api.emails.clear();
  });

  it("lets a Member set a new password with the emailed code, then sign in with it and not the old one", async () => {
    const code = await emailedCode(api, member.email);

    assert.equal((await checkCode(api, member.email, code)).status, 204);
    const newPassword = `new-${randomUUID()}`;
    const complete = await completeReset(api, member.email, code, newPassword);

    assert.equal(complete.status, 204);
    assert.equal(await complete.text(), "", "the reset signs nobody in: there is no session in the reply");
    assert.ok(await signInDirect(member.email, newPassword), "the new password works");
    assert.equal(await signInDirect(member.email, member.password), undefined, "the old password no longer works");
  });

  it("ends every session of the account: access tokens and refresh tokens stop working", async () => {
    const signIn = await postJson(api, "/members/sign-in", { email: member.email, password: member.password });
    assert.equal(signIn.status, 200);
    const phone = ((await signIn.json()) as { session: { accessToken: string; refreshToken: string } }).session;
    const me = (accessToken: string) =>
      fetch(`${api.baseUrl}/members/me`, { headers: { authorization: `Bearer ${accessToken}` } });
    assert.equal((await me(member.accessToken)).status, 200);
    assert.equal((await me(phone.accessToken)).status, 200);

    const code = await emailedCode(api, member.email);
    assert.equal((await completeReset(api, member.email, code, `new-${randomUUID()}`)).status, 204);

    assert.equal((await me(member.accessToken)).status, 401, "the first session is signed out");
    assert.equal((await me(phone.accessToken)).status, 401, "the second session is signed out");
    const refresh = await postJson(api, "/auth/refresh", { refreshToken: phone.refreshToken });
    assert.equal(refresh.status, 401, "the refresh token cannot start a new session");
  });

  it("writes the reset to the audit log and emails a 'your password was changed' notice, without the password or code", async () => {
    const audit = createAuditLog(api);
    const before = (await audit.newest())?.seq ?? 0;
    const code = await emailedCode(api, member.email);
    const newPassword = `new-${randomUUID()}`;

    assert.equal((await completeReset(api, member.email, code, newPassword)).status, 204);

    const entries = (await audit.entries({ afterSeq: before })).filter((entry) => entry.type === "password_reset");
    assert.equal(entries.length, 1);
    assert.equal(entries[0]?.actorId, member.member.id);
    assert.equal(entries[0]?.subject, member.member.id);
    assert.equal(entries[0]?.data.clientAddress, "127.0.0.1");
    const stored = JSON.stringify(entries);
    assert.ok(!stored.includes(newPassword) && !stored.includes(code), "no secret reaches the audit log");
    assert.equal((await audit.verify()).intact, true);

    const notice = api.emails.lastTo(member.email);
    assert.equal(notice?.subject, "Your LIBRAS password was changed");
    assert.match(notice.text, /reset with an emailed code/);
    assert.match(notice.text, /signed out/);
    assert.ok(!notice.text.includes(newPassword) && !notice.text.includes(code));
  });

  it("gives the same answer for an email with no account, and sends nothing", async () => {
    const unknown = `nobody-${randomUUID()}@umak.edu.ph`;

    const known = await requestCode(api, member.email);
    const stranger = await requestCode(api, unknown);

    assert.equal(stranger.status, known.status);
    const knownBody = (await known.json()) as Record<string, unknown>;
    const strangerBody = (await stranger.json()) as Record<string, unknown>;
    assert.deepEqual(Object.keys(strangerBody).sort(), Object.keys(knownBody).sort());
    assert.equal(strangerBody.email, unknown);
    assert.equal(strangerBody.codeExpiresAt, knownBody.codeExpiresAt, "the same clock gives the same expiry");
    assert.equal(api.emails.lastTo(unknown), undefined);
    assert.equal(api.emails.sent.length, 1, "only the Member got a code");
  });

  it("treats a Librarian's email like an unknown one: the same answer, no email, and the password stays", async () => {
    const librarian = await createTestAccount(api, { staff: { role: "librarian", fullName: "Lia Brarian" } });

    const response = await requestCode(api, librarian.email);

    assert.equal(response.status, 200);
    assert.equal(api.emails.sent.length, 0);
    for (const guess of ["000000", "123456"]) {
      const complete = await completeReset(api, librarian.email, guess, `new-${randomUUID()}`);
      assert.equal(await errorCode(complete), "invalid_code");
    }
    assert.ok(await signInDirect(librarian.email, librarian.password), "the Librarian's password is unchanged");
  });

  it("refuses a wrong code with a clear error, and the right code still works after it", async () => {
    const code = await emailedCode(api, member.email);

    const wrong = await checkCode(api, member.email, wrongCode(code));

    assert.equal(wrong.status, 400);
    const { error } = (await wrong.json()) as { error: { code: string; message: string } };
    assert.equal(error.code, "invalid_code");
    assert.match(error.message, /not right/);
    assert.equal((await checkCode(api, member.email, code)).status, 204);
  });

  it("refuses an expired code, and a new code works while the old one does not", async () => {
    const first = await emailedCode(api, member.email);
    api.clock.advance({ milliseconds: CODE_LIFETIME_MS });

    const expired = await completeReset(api, member.email, first, `new-${randomUUID()}`);
    assert.equal(expired.status, 400);
    assert.equal(await errorCode(expired), "code_expired");

    const second = await emailedCode(api, member.email);
    if (second !== first) assert.equal(await errorCode(await checkCode(api, member.email, first)), "invalid_code");
    const newPassword = `new-${randomUUID()}`;
    assert.equal((await completeReset(api, member.email, second, newPassword)).status, 204);
    assert.ok(await signInDirect(member.email, newPassword));
  });

  it("stops a code after five wrong guesses, until a new code is requested", async () => {
    const code = await emailedCode(api, member.email);
    for (let guess = 0; guess < 5; guess += 1) {
      assert.equal(await errorCode(await checkCode(api, member.email, wrongCode(code))), "invalid_code");
    }

    const blocked = await completeReset(api, member.email, code, `new-${randomUUID()}`);
    assert.equal(blocked.status, 429);
    assert.equal(await errorCode(blocked), "too_many_attempts");
    assert.ok(await signInDirect(member.email, member.password), "the password did not change");

    const fresh = await emailedCode(api, member.email);
    assert.equal((await checkCode(api, member.email, fresh)).status, 204);
  });

  it("counts wrong guesses for an email with no account in the same way", async () => {
    const unknown = `nobody-${randomUUID()}@umak.edu.ph`;
    assert.equal((await requestCode(api, unknown)).status, 200);
    for (let guess = 0; guess < 5; guess += 1) {
      assert.equal(await errorCode(await checkCode(api, unknown, String(100000 + guess))), "invalid_code");
    }
    assert.equal(await errorCode(await checkCode(api, unknown, "123456")), "too_many_attempts");

    api.clock.advance({ milliseconds: CODE_LIFETIME_MS });
    assert.equal((await requestCode(api, unknown)).status, 200);
    assert.equal(await errorCode(await checkCode(api, unknown, "123456")), "invalid_code", "a new request starts again");
  });

  it("holds the new password to the sign-up rules and keeps the code usable", async () => {
    const code = await emailedCode(api, member.email);

    for (const [password, message] of [
      ["short", SIGN_UP_MESSAGES.passwordTooShort],
      ["x".repeat(73), SIGN_UP_MESSAGES.passwordTooLong],
    ] as const) {
      const refused = await completeReset(api, member.email, code, password);
      assert.equal(refused.status, 400);
      const { error } = (await refused.json()) as { error: { code: string; message: string } };
      assert.equal(error.code, "invalid_password");
      assert.equal(error.message, message);
    }

    assert.ok(await signInDirect(member.email, member.password), "nothing changed");
    assert.equal((await completeReset(api, member.email, code, `new-${randomUUID()}`)).status, 204);
  });

  it("spends the code: it cannot set a password a second time", async () => {
    const code = await emailedCode(api, member.email);
    assert.equal((await completeReset(api, member.email, code, `new-${randomUUID()}`)).status, 204);

    const again = await completeReset(api, member.email, code, `other-${randomUUID()}`);

    assert.equal(await errorCode(again), "invalid_code");
  });
});

/**
 * One rule once the code is accepted: the code is spent before Supabase Auth gets the new password, so it can
 * never set a password twice, and once Supabase Auth has the new password the reset reports success.
 */
describe("Forgot password when something fails after the code is accepted", () => {
  let api: TestApi;
  let member: TestMember;
  const logger = capturingLogger();
  /** While true, Supabase Auth fails to set the password. */
  let authFails = false;

  before(async () => {
    api = await startTestApi({
      logger,
      passwordResetLimit: {
        perClientAddress: { maxRequests: 1000, windowMinutes: 15 },
        perEmail: { maxRequests: 1000, windowMinutes: 15 },
      },
      wrapAccounts: (accounts) => ({
        createUnverifiedAccount: (email, password) => accounts.createUnverifiedAccount(email, password),
        confirmEmail: (userId) => accounts.confirmEmail(userId),
        setPassword: (userId, password) =>
          authFails ? Promise.reject(new Error("Supabase Auth is down for the test")) : accounts.setPassword(userId, password),
      }),
    });
  });
  after(() => api.close());

  beforeEach(async () => {
    authFails = false;
    logger.errors.length = 0;
    member = await createTestMember(api);
  });

  it("spends the code even when Supabase Auth fails: the Member is told to ask for a new code, and the old one no longer works", async () => {
    const code = await emailedCode(api, member.email);
    authFails = true;

    const failed = await completeReset(api, member.email, code, `new-${randomUUID()}`);

    assert.equal(failed.status, 503);
    assert.deepEqual(((await failed.json()) as { error: unknown }).error, {
      code: "password_reset_unfinished",
      message: PASSWORD_RESET_MESSAGES.resetUnfinished,
    });
    assert.ok(await signInDirect(member.email, member.password), "the password did not change");
    authFails = false;
    assert.equal(await errorCode(await completeReset(api, member.email, code, `new-${randomUUID()}`)), "invalid_code");
    const fresh = await emailedCode(api, member.email);
    const newPassword = `new-${randomUUID()}`;
    assert.equal((await completeReset(api, member.email, fresh, newPassword)).status, 204);
    assert.ok(await signInDirect(member.email, newPassword));
  });

  it("reports success when the audit write fails twice, logs the entry to rebuild it, and the code cannot be used again", async () => {
    const undo = await failAuditWrites(api.db, "password_reset", "always");
    const code = await emailedCode(api, member.email);
    const newPassword = `new-${randomUUID()}`;
    try {
      const response = await completeReset(api, member.email, code, newPassword);

      assert.equal(response.status, 204, "the password is set, so the answer is a success");
    } finally {
      await undo();
    }
    assert.ok(await signInDirect(member.email, newPassword));
    assert.equal(await errorCode(await completeReset(api, member.email, code, `other-${randomUUID()}`)), "invalid_code");
    assert.equal(api.emails.lastTo(member.email)?.subject, "Your LIBRAS password was changed", "the Member is still told");
    const logged = logger.errors.filter((line) => line.includes("password_reset"));
    assert.equal(logged.length, 1, logger.errors.join("\n"));
    for (const part of [member.member.id, "127.0.0.1", "audit write refused for the test"]) assert.ok(logged[0]?.includes(part), part);
    assert.ok(!logged[0]?.includes(newPassword) && !logged[0]?.includes(code), "no secret is logged");
  });

  it("retries a failed audit write once, so one failure loses nothing", async () => {
    const audit = createAuditLog(api);
    const before = (await audit.newest())?.seq ?? 0;
    const undo = await failAuditWrites(api.db, "password_reset", "once");
    const code = await emailedCode(api, member.email);
    try {
      assert.equal((await completeReset(api, member.email, code, `new-${randomUUID()}`)).status, 204);
    } finally {
      await undo();
    }
    const entries = (await audit.entries({ afterSeq: before })).filter((entry) => entry.type === "password_reset");
    assert.deepEqual(entries.map((entry) => entry.subject), [member.member.id]);
    assert.deepEqual(logger.errors, []);
  });
});

describe("Forgot password code request limits", () => {
  let api: TestApi;

  beforeEach(async () => {
    api = await startTestApi({
      passwordResetLimit: {
        perClientAddress: { maxRequests: 6, windowMinutes: 15 },
        perEmail: { maxRequests: 2, windowMinutes: 60 },
      },
    });
  });
  afterEach(() => api.close());

  it("limits code requests for one email, whether or not it has an account", async () => {
    const member = await createTestMember(api);
    api.emails.clear();
    const unknown = `nobody-${randomUUID()}@umak.edu.ph`;

    for (const email of [member.email, unknown]) {
      assert.equal((await requestCode(api, email)).status, 200);
      assert.equal((await requestCode(api, email)).status, 200);
      const refused = await requestCode(api, email);
      assert.equal(refused.status, 429, email);
      assert.equal(await errorCode(refused), "too_many_attempts");
      assert.ok(Number(refused.headers.get("retry-after")) > 0);
    }
    assert.equal(api.emails.sent.length, 2, "the refused request sent no third code");

    api.clock.advance({ minutes: 60 });
    assert.equal((await requestCode(api, member.email)).status, 200, "the window passes");
  });

  it("limits code requests from one client address across emails", async () => {
    for (let request = 0; request < 6; request += 1) {
      assert.equal((await requestCode(api, `nobody-${randomUUID()}@umak.edu.ph`)).status, 200);
    }

    const refused = await requestCode(api, `nobody-${randomUUID()}@umak.edu.ph`);

    assert.equal(refused.status, 429);
    assert.equal(await errorCode(refused), "too_many_attempts");
    api.clock.advance({ minutes: 15 });
    assert.equal((await requestCode(api, `nobody-${randomUUID()}@umak.edu.ph`)).status, 200);
  });
});
