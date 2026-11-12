import { randomInt, randomUUID } from "node:crypto";
import type { MemberProfile, SignUpRequest } from "@libras/shared";
import { loadConfig } from "../config.ts";
import type { EmailMessage } from "../email.ts";
import { createTestAccount } from "./accounts.ts";
import type { TestApi } from "./test-api.ts";

/** The profile of a UMAK Student, which carries the student details. */
type StudentProfile = Extract<MemberProfile, { accountType: "umak_student" }>;
type StudentSignUp = Extract<SignUpRequest, { accountType: "umak_student" }>;

/**
 * A valid UMAK Student sign-up body with a unique email, username and student
 * number, so tests never collide. Pass overrides for the field under test.
 */
export function studentSignUpBody(overrides: Partial<StudentSignUp> = {}): StudentSignUp & { email: string; password: string } {
  const unique = randomUUID().replaceAll("-", "");
  return {
    accountType: "umak_student",
    email: `student-${unique.slice(0, 12)}@umak.edu.ph`,
    password: `pw-${unique}`,
    firstName: "Cobby",
    lastName: "Baldonado",
    username: `cobby_${unique.slice(0, 10)}`,
    details: { studentNumber: `K${randomInt(10_000_000, 99_999_999)}`, college: "CCIS" },
    acceptedTerms: true,
    ...overrides,
  };
}

/** The 6-digit code in a verification email. Throws when there is no email, so a test fails clearly. */
export function codeFromEmail(message: EmailMessage | undefined): string {
  const code = message === undefined ? undefined : /\b(\d{6})\b/.exec(message.text)?.[1];
  if (code === undefined) throw new Error("No verification email with a 6-digit code was sent");
  return code;
}

/** Signs in straight at Supabase Auth, as the app will. Returns the access token, or undefined when refused. */
export async function signInDirect(email: string, password: string): Promise<string | undefined> {
  const { supabaseUrl, supabasePublishableKey } = loadConfig();
  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: supabasePublishableKey, "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) return undefined;
  return ((await response.json()) as { access_token: string }).access_token;
}

export interface TestMember<Profile extends MemberProfile = MemberProfile> {
  member: Profile;
  email: string;
  password: string;
  accessToken: string;
}

/**
 * Signs a UMAK Student up through the API, reads the code from the captured
 * email, verifies it and signs in: a real Member with a session.
 */
export async function createTestMember(api: TestApi, overrides: Partial<StudentSignUp> = {}): Promise<TestMember<StudentProfile>> {
  const body = studentSignUpBody(overrides);
  const post = (path: string, payload: unknown) =>
    fetch(`${api.baseUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

  const signUp = await post("/members/sign-up", body);
  if (signUp.status !== 201) throw new Error(`Test sign-up failed: ${signUp.status} ${await signUp.text()}`);
  const code = codeFromEmail(api.emails.lastTo(body.email));
  const verify = await post("/members/sign-up/verify", { email: body.email, code });
  if (verify.status !== 200) throw new Error(`Test verification failed: ${verify.status} ${await verify.text()}`);
  const { member } = (await verify.json()) as { member: StudentProfile };

  const accessToken = await signInDirect(body.email, body.password);
  if (accessToken === undefined) throw new Error("The verified test Member could not sign in");
  return { member, email: body.email, password: body.password, accessToken };
}

/**
 * A verified Member of an Account Type that has no sign-up form yet (Visitor, Alumni: #8 builds
 * them). The Member row is written straight to the database, exactly what verifying a sign-up
 * would write, and the Member signs in at Supabase Auth. When #8 lands, sign-up can replace this.
 */
export async function createTestMemberOfType(api: TestApi, accountType: "visitor" | "alumni"): Promise<TestMember> {
  const account = await createTestAccount(api);
  const username = `${accountType}_${account.userId.slice(0, 8)}`;
  const lastName = accountType === "visitor" ? "Visitor" : "Alumni";
  await api.db.query(
    `insert into public.members (user_id, account_type, first_name, last_name, username, terms_accepted_at)
     values ($1, $2, $3, $4, $5, now())`,
    [account.userId, accountType, "Test", lastName, username],
  );
  const accessToken = await signInDirect(account.email, account.password);
  if (accessToken === undefined) throw new Error("The test Member could not sign in");
  const member: MemberProfile = {
    id: account.userId,
    email: account.email,
    accountType,
    firstName: "Test",
    lastName,
    username,
    details: {},
  };
  return { member, email: account.email, password: account.password, accessToken };
}
