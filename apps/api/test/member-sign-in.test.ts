import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createTestAccount, createTestMember, startTestApi, studentSignUpBody } from "../src/testing/index.ts";
import type { TestApi, TestMember } from "../src/testing/index.ts";

function post(api: TestApi, path: string, body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return fetch(`${api.baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

const signIn = (api: TestApi, email: string, password: string, headers: Record<string, string> = {}) =>
  post(api, "/members/sign-in", { email, password }, headers);

/** Small on purpose: every failure reaches Supabase Auth, which has its own limit per address. */
const SIGN_IN_FAILURE_LIMIT = 3;
const SIGN_IN_WINDOW_MINUTES = 15;

/** A client address of its own: the API reads it from X-Forwarded-For because the test API trusts one proxy. */
let nextAddress = 10;
const newAddress = () => ({ "x-forwarded-for": `203.0.113.${nextAddress++}` });

describe("Member sign-in", () => {
  let api: TestApi;
  let member: TestMember;

  before(async () => {
    api = await startTestApi({
      trustProxy: 1,
      signInLimit: { maxFailures: SIGN_IN_FAILURE_LIMIT, windowMinutes: SIGN_IN_WINDOW_MINUTES },
    });
    member = await createTestMember(api);
  });
  after(() => api.close());

  it("signs a Member in with email and password and returns the session and profile", async () => {
    const response = await signIn(api, member.email, member.password, newAddress());

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.member.id, member.member.id);
    assert.equal(body.member.email, member.email);
    assert.equal(body.member.accountType, "umak_student");
    assert.equal(typeof body.session.accessToken, "string");
    assert.equal(typeof body.session.refreshToken, "string");

    // The session opens Member routes.
    const me = await fetch(`${api.baseUrl}/members/me`, { headers: { authorization: `Bearer ${body.session.accessToken}` } });
    assert.equal(me.status, 200);
  });

  it("matches the email without caring about case or surrounding spaces", async () => {
    const response = await signIn(api, `  ${member.email.toUpperCase()} `, member.password, newAddress());
    assert.equal(response.status, 200);
  });

  it("gives the same error for a wrong password and an unknown email", async () => {
    const headers = newAddress();
    const wrongPassword = await signIn(api, member.email, "not-the-password", headers);
    const unknownEmail = await signIn(api, "nobody@umak.edu.ph", "not-the-password", headers);

    assert.equal(wrongPassword.status, 401);
    assert.equal(unknownEmail.status, 401);
    const a = await wrongPassword.json();
    assert.deepEqual(a, await unknownEmail.json());
    assert.equal(a.error.code, "invalid_credentials");
    assert.match(a.error.message, /email or password/i);
    assert.equal(a.session, undefined);
  });

  it("rejects a sign-in with missing fields as an invalid request", async () => {
    const response = await post(api, "/members/sign-in", { email: member.email }, newAddress());
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, "invalid_request");
  });

  it("refuses an account whose email was never verified and says to verify it", async () => {
    const body = studentSignUpBody();
    assert.equal((await post(api, "/members/sign-up", body)).status, 201);

    const response = await signIn(api, body.email, body.password, newAddress());

    assert.equal(response.status, 403);
    const refusal = await response.json();
    assert.equal(refusal.error.code, "email_not_verified");
    assert.match(refusal.error.message, /verif/i);
    assert.equal(refusal.session, undefined);
  });

  it("does not reveal that an email is unverified to someone who does not know the password", async () => {
    const body = studentSignUpBody();
    assert.equal((await post(api, "/members/sign-up", body)).status, 201);

    const response = await signIn(api, body.email, "not-the-password", newAddress());

    assert.equal(response.status, 401);
    assert.equal((await response.json()).error.code, "invalid_credentials");
  });

  it("can sign in once the unverified account is verified", async () => {
    const body = studentSignUpBody();
    assert.equal((await post(api, "/members/sign-up", body)).status, 201);
    const code = /\b(\d{6})\b/.exec(api.emails.lastTo(body.email)?.text ?? "")?.[1];
    assert.equal((await post(api, "/members/sign-up/verify", { email: body.email, code })).status, 200);

    assert.equal((await signIn(api, body.email, body.password, newAddress())).status, 200);
  });

  it("refuses a Librarian with a message that points to the desk page, and gives no session", async () => {
    const librarian = await createTestAccount(api, { staff: { role: "librarian", fullName: "Lita Reyes" } });

    const response = await signIn(api, librarian.email, librarian.password, newAddress());

    assert.equal(response.status, 403);
    const body = await response.json();
    assert.equal(body.error.code, "not_member");
    assert.equal(body.session, undefined);
  });

  it("ends the session at sign-out, after which Member routes are refused", async () => {
    const signedIn = await (await signIn(api, member.email, member.password, newAddress())).json();
    const auth = { authorization: `Bearer ${signedIn.session.accessToken}` };
    assert.equal((await fetch(`${api.baseUrl}/members/me`, { headers: auth })).status, 200);

    const out = await fetch(`${api.baseUrl}/auth/sign-out`, { method: "POST", headers: auth });
    assert.equal(out.status, 204);

    const after = await fetch(`${api.baseUrl}/members/me`, { headers: auth });
    assert.equal(after.status, 401);
    assert.equal((await after.json()).error.code, "not_signed_in");
  });

  describe("rate limiting", () => {
    async function failTimes(count: number, headers: Record<string, string>) {
      for (let i = 0; i < count; i++) {
        const response = await signIn(api, member.email, "not-the-password", headers);
        assert.equal(response.status, 401, `attempt ${i + 1} should be an ordinary refusal`);
      }
    }

    it("blocks an address after repeated failures, even with the right password, until the period passes", async () => {
      const address = newAddress();
      await failTimes(SIGN_IN_FAILURE_LIMIT, address);

      const blocked = await signIn(api, member.email, member.password, address);
      assert.equal(blocked.status, 429);
      assert.equal((await blocked.json()).error.code, "too_many_attempts");
      const retryAfter = Number(blocked.headers.get("retry-after"));
      assert.ok(retryAfter > 0 && retryAfter <= SIGN_IN_WINDOW_MINUTES * 60, `Retry-After was ${retryAfter}`);

      // Still blocked part of the way through the period, free again after it.
      api.clock.advance({ minutes: SIGN_IN_WINDOW_MINUTES - 1 });
      assert.equal((await signIn(api, member.email, member.password, address)).status, 429);
      api.clock.advance({ minutes: 2 });
      assert.equal((await signIn(api, member.email, member.password, address)).status, 200);
    });

    it("lets no more guesses through than the limit when they arrive at the same moment", async () => {
      const address = newAddress();
      const guesses = await Promise.all(
        Array.from({ length: SIGN_IN_FAILURE_LIMIT * 3 }, () => signIn(api, member.email, "not-the-password", address)),
      );
      const statuses = guesses.map((response) => response.status);
      assert.equal(statuses.filter((status) => status === 401).length, SIGN_IN_FAILURE_LIMIT, `statuses: ${statuses.join(", ")}`);
      assert.equal(statuses.filter((status) => status === 429).length, SIGN_IN_FAILURE_LIMIT * 2);
      assert.equal((await signIn(api, member.email, member.password, address)).status, 429);
    });

    it("does not count a sign-in that succeeds, even while it is in flight with others", async () => {
      const address = newAddress();
      const attempts = await Promise.all([
        signIn(api, member.email, member.password, address),
        ...Array.from({ length: SIGN_IN_FAILURE_LIMIT - 1 }, () => signIn(api, member.email, "not-the-password", address)),
      ]);
      assert.deepEqual(
        attempts.map((response) => response.status).sort(),
        [200, ...Array.from({ length: SIGN_IN_FAILURE_LIMIT - 1 }, () => 401)].sort(),
      );
      // Only the refusals count: one more guess is still allowed.
      assert.equal((await signIn(api, member.email, member.password, address)).status, 200);
    });

    it("leaves other client addresses alone", async () => {
      const noisy = newAddress();
      await failTimes(SIGN_IN_FAILURE_LIMIT, noisy);
      assert.equal((await signIn(api, member.email, member.password, noisy)).status, 429);

      assert.equal((await signIn(api, member.email, member.password, newAddress())).status, 200);
    });

    it("does not block an address that stays below the limit", async () => {
      const address = newAddress();
      await failTimes(SIGN_IN_FAILURE_LIMIT - 1, address);
      assert.equal((await signIn(api, member.email, member.password, address)).status, 200);
    });

    it("counts failures of any kind: unknown emails and unverified accounts too", async () => {
      const address = newAddress();
      for (let i = 0; i < SIGN_IN_FAILURE_LIMIT; i++) {
        await signIn(api, `nobody-${i}@umak.edu.ph`, "not-the-password", address);
      }
      assert.equal((await signIn(api, member.email, member.password, address)).status, 429);
    });

    it("also protects the Librarian sign-in", async () => {
      const address = newAddress();
      for (let i = 0; i < SIGN_IN_FAILURE_LIMIT; i++) {
        const response = await post(api, "/staff/sign-in", { email: member.email, password: "not-the-password" }, address);
        assert.equal(response.status, 401);
      }
      const blocked = await post(api, "/staff/sign-in", { email: member.email, password: member.password }, address);
      assert.equal(blocked.status, 429);
    });
  });
});
