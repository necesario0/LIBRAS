import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { startTestApi } from "../src/testing/index.ts";
import type { TestApi } from "../src/testing/index.ts";
import { codeFromEmail, createTestMember, signInDirect, studentSignUpBody } from "../src/testing/members.ts";

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

describe("UMAK Student sign-up", () => {
  let api: TestApi;
  const signUpUrl = () => `${api.baseUrl}/members/sign-up`;
  const verifyUrl = () => `${api.baseUrl}/members/sign-up/verify`;
  const resendUrl = () => `${api.baseUrl}/members/sign-up/resend`;

  before(async () => {
    api = await startTestApi();
  });
  after(() => api.close());

  it("sends a verification code by email and activates the account as soon as the code is accepted", async () => {
    const body = studentSignUpBody();

    const signUp = await postJson(signUpUrl(), body);
    assert.equal(signUp.status, 201);
    const pending = await signUp.json();
    assert.equal(pending.email, body.email);

    const code = codeFromEmail(api.emails.lastTo(body.email));
    assert.match(code, /^\d{6}$/);

    const verify = await postJson(verifyUrl(), { email: body.email, code });
    assert.equal(verify.status, 200);
    const verified = await verify.json();
    assert.equal(verified.member.email, body.email);
    assert.equal(verified.member.accountType, "umak_student");
    assert.equal(verified.member.firstName, body.firstName);
    assert.equal(verified.member.details.studentNumber, body.details.studentNumber);
    assert.equal(verified.member.details.college, body.details.college);
    assert.ok(await signInDirect(body.email, body.password), "the new Member can sign in at once, with no approval step");
  });

  it("does not let the person sign in before the code is accepted", async () => {
    const body = studentSignUpBody();

    await postJson(signUpUrl(), body);

    assert.equal(await signInDirect(body.email, body.password), undefined);
  });

  it("refuses an email that is not @umak.edu.ph with a clear, correctable error", async () => {
    for (const email of ["cobby@gmail.com", "cobby@umak.edu.ph.example.com", "cobby@mail.umak.edu.ph", "cobby@umak.edu"]) {
      api.emails.clear();

      const response = await postJson(signUpUrl(), studentSignUpBody({ email }));

      assert.equal(response.status, 400, email);
      const { error } = await response.json();
      assert.equal(error.code, "umak_email_required", email);
      assert.match(error.message, /@umak\.edu\.ph/);
      assert.equal(api.emails.sent.length, 0);
    }
  });

  it("accepts a UMAK address in any letter case", async () => {
    const body = studentSignUpBody({ email: `Mixed-${Date.now()}@UMAK.edu.PH` });

    const response = await postJson(signUpUrl(), body);

    assert.equal(response.status, 201);
    assert.equal((await response.json()).email, body.email.toLowerCase());
    assert.ok(api.emails.lastTo(body.email.toLowerCase()));
  });

  it("refuses to create the account until the terms are accepted", async () => {
    for (const acceptedTerms of [false, undefined]) {
      const body = { ...studentSignUpBody(), acceptedTerms };
      api.emails.clear();

      const response = await postJson(signUpUrl(), body);

      assert.equal(response.status, 400);
      assert.equal((await response.json()).error.code, "terms_not_accepted");
      assert.equal(api.emails.sent.length, 0);
    }
  });

  it("validates every field with the shared schemas and never shows library wording", async () => {
    const cases: Array<[string, Record<string, unknown>]> = [
      ["a short password", { password: "short" }],
      ["a student number in the wrong format", { details: { studentNumber: "12345", college: "CCIS" } }],
      ["a college that does not exist", { details: { studentNumber: "K12256165", college: "NOPE" } }],
      ["a username with spaces", { username: "two words" }],
      ["a missing last name", { lastName: "  " }],
      ["a malformed contact number", { contactNumber: "call me" }],
    ];
    for (const [label, change] of cases) {
      const response = await postJson(signUpUrl(), { ...studentSignUpBody(), ...change });

      assert.equal(response.status, 400, label);
      const { error } = await response.json();
      assert.equal(error.code, "invalid_request", label);
      assert.doesNotMatch(error.message, /expected|invalid input|zod/i, label);
    }
  });

  it("stores an empty contact number and middle name as none", async () => {
    const body = studentSignUpBody({ middleName: "  ", contactNumber: "" });
    await postJson(signUpUrl(), body);
    const code = codeFromEmail(api.emails.lastTo(body.email));

    const verified = await (await postJson(verifyUrl(), { email: body.email, code })).json();

    assert.equal(verified.member.middleName, undefined);
    assert.equal(verified.member.contactNumber, undefined);
  });

  describe("the verification code", () => {
    async function startSignUp() {
      const body = studentSignUpBody();
      const response = await postJson(signUpUrl(), body);
      assert.equal(response.status, 201);
      return { body, code: codeFromEmail(api.emails.lastTo(body.email)) };
    }
    const verify = (email: string, code: string) => postJson(verifyUrl(), { email, code });
    const wrongCode = (code: string) => (code === "000000" ? "000001" : "000000");

    it("shows a clear error for a wrong code and still accepts the right one afterwards", async () => {
      const { body, code } = await startSignUp();

      const wrong = await verify(body.email, wrongCode(code));
      assert.equal(wrong.status, 400);
      const { error } = await wrong.json();
      assert.equal(error.code, "invalid_code");
      assert.match(error.message, /not right/i);
      assert.equal(await signInDirect(body.email, body.password), undefined);

      assert.equal((await verify(body.email, code)).status, 200);
      assert.ok(await signInDirect(body.email, body.password));
    });

    it("shows a clear error for an expired code", async () => {
      const { body, code } = await startSignUp();

      api.clock.advance({ minutes: 11 });
      const response = await verify(body.email, code);

      assert.equal(response.status, 400);
      const { error } = await response.json();
      assert.equal(error.code, "code_expired");
      assert.match(error.message, /expired/i);
    });

    it("stops accepting a code after five wrong guesses, even the right one", async () => {
      const { body, code } = await startSignUp();

      for (let attempt = 0; attempt < 5; attempt++) {
        assert.equal((await verify(body.email, wrongCode(code))).status, 400);
      }
      const locked = await verify(body.email, code);

      assert.equal(locked.status, 429);
      assert.equal((await locked.json()).error.code, "too_many_attempts");
    });

    it("rejects a code that is not six digits as an invalid request", async () => {
      const { body } = await startSignUp();

      const response = await verify(body.email, "12ab");

      assert.equal(response.status, 400);
      assert.equal((await response.json()).error.code, "invalid_request");
    });

    it("says there is no sign-up for an email that never started one", async () => {
      const response = await verify("nobody-here@umak.edu.ph", "123456");

      assert.equal(response.status, 404);
      assert.equal((await response.json()).error.code, "no_pending_signup");
    });

    it("lets the person request a new code, which replaces the old one", async () => {
      const { body, code: first } = await startSignUp();
      api.clock.advance({ seconds: 31 });

      const resend = await postJson(resendUrl(), { email: body.email });
      assert.equal(resend.status, 200);
      const second = codeFromEmail(api.emails.lastTo(body.email));

      if (second !== first) assert.equal((await verify(body.email, first)).status, 400);
      assert.equal((await verify(body.email, second)).status, 200);
    });

    it("lets a locked-out person start over with a new code", async () => {
      const { body, code } = await startSignUp();
      for (let attempt = 0; attempt < 5; attempt++) await verify(body.email, wrongCode(code));
      api.clock.advance({ seconds: 31 });

      await postJson(resendUrl(), { email: body.email });

      assert.equal((await verify(body.email, codeFromEmail(api.emails.lastTo(body.email)))).status, 200);
    });

    it("makes the person wait a few seconds between emails", async () => {
      const { body } = await startSignUp();
      const emailsBefore = api.emails.sent.length;

      const tooSoon = await postJson(resendUrl(), { email: body.email });

      assert.equal(tooSoon.status, 429);
      const { error } = await tooSoon.json();
      assert.equal(error.code, "code_requested_too_soon");
      assert.match(error.message, /\d+ seconds/);
      assert.equal(api.emails.sent.length, emailsBefore);
    });

    it("says there is nothing to resend for an email that never started a sign-up", async () => {
      const response = await postJson(resendUrl(), { email: "nobody-here@umak.edu.ph" });

      assert.equal(response.status, 404);
    });
  });

  describe("duplicates", () => {
    it("refuses an email that already has an account", async () => {
      const existing = await createTestMember(api);

      const response = await postJson(signUpUrl(), studentSignUpBody({ email: existing.email }));

      assert.equal(response.status, 409);
      assert.equal((await response.json()).error.code, "email_taken");
    });

    it("refuses a username or student number that is already taken", async () => {
      const existing = await createTestMember(api);

      const username = await postJson(signUpUrl(), studentSignUpBody({ username: existing.member.username.toUpperCase() }));
      const studentNumber = await postJson(signUpUrl(), studentSignUpBody({ details: existing.member.details }));

      assert.equal(username.status, 409);
      assert.equal((await username.json()).error.code, "username_taken");
      assert.equal(studentNumber.status, 409);
      assert.equal((await studentNumber.json()).error.code, "student_number_taken");
    });

    it("lets a sign-up that never finished be started again with the same email", async () => {
      const first = studentSignUpBody();
      await postJson(signUpUrl(), first);
      const staleCode = codeFromEmail(api.emails.lastTo(first.email));
      api.clock.advance({ minutes: 1 });

      const again = studentSignUpBody({ email: first.email });
      assert.equal((await postJson(signUpUrl(), again)).status, 201);
      const code = codeFromEmail(api.emails.lastTo(first.email));
      if (code !== staleCode) assert.equal((await postJson(verifyUrl(), { email: first.email, code: staleCode })).status, 400);
      assert.equal((await postJson(verifyUrl(), { email: first.email, code })).status, 200);

      assert.equal(await signInDirect(first.email, first.password), undefined, "the first password no longer works");
      assert.ok(await signInDirect(again.email, again.password));
    });
  });
});
