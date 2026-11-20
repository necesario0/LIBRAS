import type { Session } from "./auth.ts";
import type {
  AlumniDetails,
  FacultyDetails,
  NtpEmployeeDetails,
  UmakCollege,
  UmakStudentDetails,
  VisitorDetails,
} from "./sign-up.ts";

interface MemberBase {
  /** The account id: the same as the sign-in identity. */
  id: string;
  email: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  username: string;
  contactNumber?: string;
}

/**
 * A Member as the app sees them. `details` holds what only that Account Type
 * gives at sign-up, so the Account Type tells which details there are.
 */
export type MemberProfile = MemberBase &
  (
    | { accountType: "umak_student"; details: UmakStudentDetails }
    | { accountType: "faculty"; details: FacultyDetails }
    | { accountType: "ntp_employee"; details: NtpEmployeeDetails }
    | { accountType: "visitor"; details: VisitorDetails }
    | { accountType: "alumni"; details: AlumniDetails }
  );

/** The body of `POST /members/sign-up` and `POST /members/sign-up/resend`: a code is on its way. */
export interface SignUpCodeSentResponse {
  email: string;
  /** When the code stops working, ISO 8601. */
  codeExpiresAt: string;
  /** When a new code may be requested, ISO 8601. */
  resendAvailableAt: string;
}

/** The body of `POST /members/sign-up/verify`. The account is active from here on. */
export interface VerifySignUpResponse {
  member: MemberProfile;
}

/** The body of `GET /members/me`. */
export interface MemberMeResponse {
  member: MemberProfile;
}

/** The body of `POST /members/sign-in`. */
export interface MemberSignInResponse {
  session: Session;
  member: MemberProfile;
}

/**
 * A Member's name as the app and the desk write it: first, middle and last,
 * with a missing or empty middle name left out.
 */
export function memberFullName(name: { firstName: string; middleName?: string | null; lastName: string }): string {
  return [name.firstName, name.middleName, name.lastName].filter((part) => part !== undefined && part !== null && part !== "").join(" ");
}

/** The UMAK college a Member gave at sign-up (UMAK Students, Faculty and NTP / Employees), or null for an Account Type that has none. */
export function memberCollege(member: MemberProfile): UmakCollege | null {
  switch (member.accountType) {
    case "umak_student":
    case "faculty":
    case "ntp_employee":
      return member.details.college;
    case "visitor":
    case "alumni":
      return null;
  }
}
