import type { SignUpRequest } from "@libras/shared";
import type { SignUpDraft } from "./SignUpContext";

/** The step that collects what only this Account Type gives, after the name. */
export const DETAILS_ROUTE = {
  umak_student: "/sign-up/student",
  faculty: "/sign-up/faculty",
  ntp_employee: "/sign-up/ntp-employee",
  visitor: "/sign-up/visitor",
  alumni: "/sign-up/alumni",
} as const satisfies Record<SignUpDraft["accountType"], string>;

/**
 * The sign-up body for the draft's Account Type, or undefined when a choice
 * the details step insists on (a college, a graduation year) is still missing:
 * the caller sends the person back to that step. The API checks everything
 * again; this only picks the right details for the type.
 */
export function buildSignUpRequest(draft: SignUpDraft): SignUpRequest | undefined {
  const common = {
    email: draft.email,
    password: draft.password,
    firstName: draft.firstName,
    middleName: draft.middleName,
    lastName: draft.lastName,
    username: draft.username,
    contactNumber: draft.contactNumber,
    acceptedTerms: true,
  } as const;

  switch (draft.accountType) {
    case "umak_student":
      if (draft.college === undefined) return undefined;
      return {
        ...common,
        accountType: "umak_student",
        details: { studentNumber: draft.studentNumber, college: draft.college },
      };
    case "faculty":
      if (draft.college === undefined) return undefined;
      return { ...common, accountType: "faculty", details: { facultyNumber: draft.facultyNumber, college: draft.college } };
    case "ntp_employee":
      if (draft.college === undefined) return undefined;
      return {
        ...common,
        accountType: "ntp_employee",
        details: { employeeNumber: draft.employeeNumber, college: draft.college },
      };
    case "visitor":
      return {
        ...common,
        accountType: "visitor",
        details: {
          validIdNumber: draft.validIdNumber,
          ...(draft.idType === undefined ? {} : { idType: draft.idType }),
          institution: draft.institution,
        },
      };
    case "alumni":
      if (draft.yearGraduated === undefined) return undefined;
      return {
        ...common,
        accountType: "alumni",
        details: { yearGraduated: draft.yearGraduated, alumniIdNumber: draft.alumniIdNumber },
      };
  }
}
