import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import {
  alumniSignUpBody,
  codeFromEmail,
  facultySignUpBody,
  ntpEmployeeSignUpBody,
  signInDirect,
  startTestApi,
  visitorSignUpBody,
} from "../src/testing/index.ts";
import type { TestApi } from "../src/testing/index.ts";

/** What a sign-up of any Account Type sends: the fields every type shares. */
interface SignUpBody {
  accountType: string;
  email: string;
  password: string;
  [field: string]: unknown;
}

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

describe("Sign-up for the other Account Types", () => {
  let api: TestApi;
  const signUp = (body: unknown) => postJson(`${api.baseUrl}/members/sign-up`, body);

  /** Signs up, reads the emailed code and verifies it: the whole path to an active account. */
  async function signUpAndVerify(body: SignUpBody) {
    const started = await signUp(body);
    assert.equal(started.status, 201, await started.clone().text());
    const code = codeFromEmail(api.emails.lastTo(body.email.toLowerCase()));
    const verified = await postJson(`${api.baseUrl}/members/sign-up/verify`, { email: body.email, code });
    assert.equal(verified.status, 200, await verified.clone().text());
    return (await verified.json()) as { member: Record<string, unknown> & { details: Record<string, unknown> } };
  }

  before(async () => {
    api = await startTestApi();
  });
  after(() => api.close());

  /** The two Account Types that must give a university address. */
  const umakTypes = [
    { label: "Faculty", accountType: "faculty", build: facultySignUpBody },
    { label: "NTP / Employee", accountType: "ntp_employee", build: ntpEmployeeSignUpBody },
  ] as const;

  for (const { label, accountType, build } of umakTypes) {
    describe(label, () => {
      it("signs up with a UMAK email and is active once the emailed code is accepted", async () => {
        const body = build();

        const { member } = await signUpAndVerify(body);

        assert.equal(member.accountType, accountType);
        assert.equal(member.email, body.email);
        assert.equal(member.firstName, body.firstName);
        assert.deepEqual(member.details, body.details);
        assert.ok(await signInDirect(body.email, body.password), "the new Member can sign in at once, with no approval step");
      });

      it("cannot sign in before the code is accepted", async () => {
        const body = build();

        await signUp(body);

        assert.equal(await signInDirect(body.email, body.password), undefined);
      });

      it("refuses an email that is not @umak.edu.ph with a clear, correctable error", async () => {
        for (const email of ["cobby@gmail.com", "cobby@umak.edu.ph.example.com", "cobby@mail.umak.edu.ph", "cobby@umak.edu"]) {
          api.emails.clear();

          const response = await signUp(build({ email }));

          assert.equal(response.status, 400, email);
          const { error } = await response.json();
          assert.equal(error.code, "umak_email_required", email);
          assert.match(error.message, /@umak\.edu\.ph/);
          assert.equal(api.emails.sent.length, 0);
        }
      });

      it("refuses a missing or malformed college, or number, in plain words", async () => {
        const original = build();
        const cases: Array<[string, unknown]> = [
          ["a college that does not exist", { ...original.details, college: "NOPE" }],
          ["no college", { ...original.details, college: undefined }],
          ["no number", Object.fromEntries(Object.entries(original.details).map(([key, value]) => [key, key === "college" ? value : ""]))],
        ];
        for (const [reason, details] of cases) {
          const response = await signUp({ ...original, details });

          assert.equal(response.status, 400, reason);
          const { error } = await response.json();
          assert.equal(error.code, "invalid_request", reason);
          assert.doesNotMatch(error.message, /expected|invalid input|zod/i, reason);
        }
      });

      it("refuses to create the account until the terms are accepted", async () => {
        api.emails.clear();

        const response = await signUp({ ...build(), acceptedTerms: false });

        assert.equal(response.status, 400);
        assert.equal((await response.json()).error.code, "terms_not_accepted");
        assert.equal(api.emails.sent.length, 0);
      });

      it("keeps the profile on the Member's own routes after signing in", async () => {
        const body = build();
        await signUpAndVerify(body);
        const accessToken = await signInDirect(body.email, body.password);

        const me = await fetch(`${api.baseUrl}/members/me`, { headers: { authorization: `Bearer ${accessToken}` } });

        assert.equal(me.status, 200);
        const { member } = await me.json();
        assert.equal(member.accountType, accountType);
        assert.deepEqual(member.details, body.details);
      });
    });
  }

  describe("Visitor", () => {
    it("signs up with any email address and is active once the emailed code is accepted", async () => {
      for (const email of [`visitor-${Date.now()}@gmail.com`, `Visitor-${Date.now()}@Example.Co.PH`]) {
        const body = visitorSignUpBody({ email });

        const { member } = await signUpAndVerify(body);

        assert.equal(member.accountType, "visitor");
        assert.equal(member.email, email.toLowerCase());
        assert.deepEqual(member.details, body.details);
        assert.equal(member.contactNumber, body.contactNumber);
        assert.ok(await signInDirect(email, body.password), "the new Visitor can sign in at once");
      }
    });

    it("still refuses an address that is not an email at all", async () => {
      const response = await signUp(visitorSignUpBody({ email: "not-an-email" }));

      assert.equal(response.status, 400);
      assert.equal((await response.json()).error.code, "invalid_request");
    });

    it("needs a contact number, as the Figma form marks it required", async () => {
      for (const contactNumber of [undefined, "", "  "]) {
        const response = await signUp({ ...visitorSignUpBody(), contactNumber });

        assert.equal(response.status, 400, String(contactNumber));
        const { error } = await response.json();
        assert.equal(error.code, "invalid_request");
        assert.match(error.message, /contact number/i);
      }
    });

    it("needs the valid ID number and the school or institution, and accepts any listed ID type or none", async () => {
      const base = visitorSignUpBody();
      for (const change of [{ validIdNumber: "" }, { institution: "  " }, { idType: "Library card" }]) { // glossary-ok: an ID type that is not on the list
        const response = await signUp({ ...base, details: { ...base.details, ...change } });
        assert.equal(response.status, 400, JSON.stringify(change));
      }

      const noType = visitorSignUpBody();
      const { idType, ...detailsWithoutType } = noType.details;
      void idType;
      const { member } = await signUpAndVerify({ ...noType, details: detailsWithoutType });
      assert.deepEqual(member.details, detailsWithoutType);
    });

    it("refuses to create the account until the terms are accepted", async () => {
      const response = await signUp({ ...visitorSignUpBody(), acceptedTerms: undefined });

      assert.equal(response.status, 400);
      assert.equal((await response.json()).error.code, "terms_not_accepted");
    });
  });

  describe("Alumni", () => {
    it("signs up with any email address and is active once the emailed code is accepted", async () => {
      const body = alumniSignUpBody();

      const { member } = await signUpAndVerify(body);

      assert.equal(member.accountType, "alumni");
      assert.deepEqual(member.details, body.details);
      assert.equal(member.contactNumber, undefined, "the contact number is optional for Alumni");
      assert.ok(await signInDirect(body.email, body.password), "the new Alumni can sign in at once");
    });

    it("keeps an optional contact number when one is given", async () => {
      const { member } = await signUpAndVerify(alumniSignUpBody({ contactNumber: "0948 759 3485" }));

      assert.equal(member.contactNumber, "0948 759 3485");
    });

    it("needs the alumni ID number and a graduation year from the list", async () => {
      const base = alumniSignUpBody();
      for (const change of [{ alumniIdNumber: "" }, { yearGraduated: "1999-2000" }, { yearGraduated: undefined }]) {
        const response = await signUp({ ...base, details: { ...base.details, ...change } });

        assert.equal(response.status, 400, JSON.stringify(change));
        assert.doesNotMatch((await response.json()).error.message, /expected|invalid input|zod/i);
      }
    });

    it("accepts the Other choice for the graduation year", async () => {
      const body = alumniSignUpBody();

      const { member } = await signUpAndVerify({ ...body, details: { ...body.details, yearGraduated: "Other" } });

      assert.equal(member.details.yearGraduated, "Other");
    });
  });

  it("does not let one Account Type's details stand in for another's", async () => {
    const faculty = facultySignUpBody();

    const response = await signUp({ ...faculty, accountType: "ntp_employee" });

    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, "invalid_request");
  });

  it("refuses an Account Type that does not exist", async () => {
    const response = await signUp({ ...facultySignUpBody(), accountType: "librarian" });

    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, "invalid_request");
  });
});
