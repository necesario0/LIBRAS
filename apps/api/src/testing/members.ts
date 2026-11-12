import { randomInt, randomUUID } from "node:crypto";
import type { MemberProfile, SignUpRequest } from "@libras/shared";
import { loadConfig } from "../config.ts";
import type { EmailMessage } from "../email.ts";
import type { TestApi } from "./test-api.ts";

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

type FacultySignUp = Extract<SignUpRequest, { accountType: "faculty" }>;
type NtpEmployeeSignUp = Extract<SignUpRequest, { accountType: "ntp_employee" }>;
type VisitorSignUp = Extract<SignUpRequest, { accountType: "visitor" }>;
type AlumniSignUp = Extract<SignUpRequest, { accountType: "alumni" }>;

/** The fields every Account Type gives, with a unique email, username and password. */
function commonBody(prefix: string, domain: string) {
  const unique = randomUUID().replaceAll("-", "");
  return {
    email: `${prefix}-${unique.slice(0, 12)}@${domain}`,
    password: `pw-${unique}`,
    firstName: "Cobby",
    lastName: "Baldonado",
    username: `${prefix}_${unique.slice(0, 10)}`,
    acceptedTerms: true as const,
  };
}

/** A valid Faculty sign-up body. Pass overrides for the field under test. */
export function facultySignUpBody(overrides: Partial<FacultySignUp> = {}): FacultySignUp & { email: string; password: string } {
  return {
    accountType: "faculty",
    ...commonBody("faculty", "umak.edu.ph"),
    details: { facultyNumber: `F${randomInt(1_000_000, 9_999_999)}`, college: "CCIS" },
    ...overrides,
  };
}

/** A valid NTP / Employee sign-up body. */
export function ntpEmployeeSignUpBody(
  overrides: Partial<NtpEmployeeSignUp> = {},
): NtpEmployeeSignUp & { email: string; password: string } {
  return {
    accountType: "ntp_employee",
    ...commonBody("ntp", "umak.edu.ph"),
    details: { employeeNumber: `E${randomInt(1_000_000, 9_999_999)}`, college: "CCIS" },
    ...overrides,
  };
}

/** A valid Visitor sign-up body. A Visitor must give a contact number. */
export function visitorSignUpBody(overrides: Partial<VisitorSignUp> = {}): VisitorSignUp & { email: string; password: string } {
  return {
    accountType: "visitor",
    ...commonBody("visitor", "gmail.com"),
    contactNumber: "09034984958",
    details: { validIdNumber: "39458-3940-380", idType: "Passport", institution: "FEU (Far Eastern University)" },
    ...overrides,
  };
}

/** A valid Alumni sign-up body. */
export function alumniSignUpBody(overrides: Partial<AlumniSignUp> = {}): AlumniSignUp & { email: string; password: string } {
  return {
    accountType: "alumni",
    ...commonBody("alumni", "yahoo.com"),
    details: { yearGraduated: "2025-2026", alumniIdNumber: `${randomInt(1_000_000, 9_999_999)}` },
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

export interface TestMember {
  member: Extract<MemberProfile, { accountType: "umak_student" }>;
  email: string;
  password: string;
  accessToken: string;
}

/**
 * Signs a UMAK Student up through the API, reads the code from the captured
 * email, verifies it and signs in: a real Member with a session.
 */
export async function createTestMember(api: TestApi, overrides: Partial<StudentSignUp> = {}): Promise<TestMember> {
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
  const { member } = (await verify.json()) as { member: TestMember["member"] };

  const accessToken = await signInDirect(body.email, body.password);
  if (accessToken === undefined) throw new Error("The verified test Member could not sign in");
  return { member, email: body.email, password: body.password, accessToken };
}
