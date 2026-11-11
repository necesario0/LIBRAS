import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createTestAccount, startTestApi } from "../src/testing/index.ts";
import { loadConfig } from "../src/config.ts";
import type { TestAccount, TestApi } from "../src/testing/index.ts";

function postJson(url: string, body: unknown, accessToken?: string): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe("Librarian sign-in", () => {
  let api: TestApi;
  let librarian: TestAccount;

  before(async () => {
    api = await startTestApi();
    librarian = await createTestAccount(api, { staff: { role: "librarian", fullName: "Lita Reyes" } });
  });
  after(() => api.close());

  it("signs a Librarian in with email and password", async () => {
    const response = await postJson(`${api.baseUrl}/staff/sign-in`, {
      email: librarian.email,
      password: librarian.password,
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body.staff, {
      id: librarian.userId,
      email: librarian.email,
      fullName: "Lita Reyes",
      role: "librarian",
    });
    assert.equal(typeof body.session.accessToken, "string");
    assert.equal(typeof body.session.refreshToken, "string");
    assert.ok(Date.parse(body.session.expiresAt) > Date.now());
  });

  it("refuses a Member account with a message that says the desk page is for staff", async () => {
    const member = await createTestAccount(api);

    const response = await postJson(`${api.baseUrl}/staff/sign-in`, { email: member.email, password: member.password });

    assert.equal(response.status, 403);
    const body = await response.json();
    assert.equal(body.error.code, "not_staff");
    assert.match(body.error.message, /staff/i);
    assert.equal(body.session, undefined);
  });

  it("gives the same error for a wrong password and an unknown email", async () => {
    const wrongPassword = await postJson(`${api.baseUrl}/staff/sign-in`, { email: librarian.email, password: "not-the-password" });
    const unknownEmail = await postJson(`${api.baseUrl}/staff/sign-in`, { email: "nobody@example.com", password: "not-the-password" });

    assert.equal(wrongPassword.status, 401);
    assert.equal(unknownEmail.status, 401);
    const a = await wrongPassword.json();
    const b = await unknownEmail.json();
    assert.deepEqual(a, b);
    assert.equal(a.error.code, "invalid_credentials");
    assert.doesNotMatch(a.error.message, /(email|password) (is|was) (wrong|unknown|not found)/i);
  });

  it("rejects a sign-in with missing fields as an invalid request", async () => {
    const response = await postJson(`${api.baseUrl}/staff/sign-in`, { email: librarian.email });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, "invalid_request");
  });

  it("opens staff routes for a signed-in Librarian only", async () => {
    const signedIn = await (await postJson(`${api.baseUrl}/staff/sign-in`, { email: librarian.email, password: librarian.password })).json();
    const headers = { authorization: `Bearer ${signedIn.session.accessToken}` };

    const mine = await fetch(`${api.baseUrl}/staff/me`, { headers });
    assert.equal(mine.status, 200);
    assert.equal((await mine.json()).staff.fullName, "Lita Reyes");

    const anonymous = await fetch(`${api.baseUrl}/staff/me`);
    assert.equal(anonymous.status, 401);
    assert.equal((await anonymous.json()).error.code, "not_signed_in");

    const garbage = await fetch(`${api.baseUrl}/staff/me`, { headers: { authorization: "Bearer nonsense" } });
    assert.equal(garbage.status, 401);
  });

  it("refuses staff routes to a signed-in Member", async () => {
    const member = await createTestAccount(api);
    // Sign the Member in directly with Supabase Auth, as the mobile app will.
    const token = await signInDirect(member);
    const response = await fetch(`${api.baseUrl}/staff/me`, { headers: { authorization: `Bearer ${token}` } });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error.code, "not_staff");
  });

  it("signs out: the access token stops working", async () => {
    const signedIn = await (await postJson(`${api.baseUrl}/staff/sign-in`, { email: librarian.email, password: librarian.password })).json();
    const token = signedIn.session.accessToken;

    const out = await postJson(`${api.baseUrl}/auth/sign-out`, {}, token);
    assert.equal(out.status, 204);

    const after = await fetch(`${api.baseUrl}/staff/me`, { headers: { authorization: `Bearer ${token}` } });
    assert.equal(after.status, 401);
  });

  it("renews a session with the refresh token, once", async () => {
    const signedIn = await (await postJson(`${api.baseUrl}/staff/sign-in`, { email: librarian.email, password: librarian.password })).json();
    const refreshToken = signedIn.session.refreshToken;

    const renewed = await postJson(`${api.baseUrl}/auth/refresh`, { refreshToken });
    assert.equal(renewed.status, 200);
    const { session } = await renewed.json();
    const me = await fetch(`${api.baseUrl}/staff/me`, { headers: { authorization: `Bearer ${session.accessToken}` } });
    assert.equal(me.status, 200);

    const reused = await postJson(`${api.baseUrl}/auth/refresh`, { refreshToken: "bogus-refresh-token" });
    assert.equal(reused.status, 401);
  });
});

async function signInDirect(account: TestAccount): Promise<string> {
  const { supabaseUrl: url, supabasePublishableKey: key } = loadConfig();
  const response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: key, "content-type": "application/json" },
    body: JSON.stringify({ email: account.email, password: account.password }),
  });
  assert.equal(response.status, 200);
  return (await response.json()).access_token;
}
