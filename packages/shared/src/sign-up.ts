import { z } from "zod";
import { isUmakEmail, requiresUmakEmail } from "./accounts.ts";
import type { AccountType } from "./accounts.ts";

/**
 * Words shown to the person. They live here so the app and the API say the
 * same thing: the app checks a field with these schemas before it sends, and
 * the API checks again and answers with the same wording.
 */
export const SIGN_UP_MESSAGES = {
  emailInvalid: "Enter a valid email address, for example name@umak.edu.ph.",
  umakEmailRequired:
    "This account type needs your @umak.edu.ph email address. Enter your UMAK email, or go back and choose another account type.",
  passwordTooShort: "Use at least 8 characters for your password.",
  passwordTooLong: "Use at most 72 characters for your password.",
  passwordsDiffer: "The passwords do not match. Please try again.",
  nameRequired: "This field is required.",
  nameTooLong: "Use at most 60 characters.",
  usernameInvalid: "Use 3 to 30 letters, numbers, dots or underscores.",
  contactNumberInvalid: "Enter a valid contact number, or leave it empty.",
  studentNumberInvalid: "Enter your student number, for example K12256165.",
  collegeRequired: "Select your college.",
  facultyNumberInvalid: "Enter your faculty number.",
  employeeNumberInvalid: "Enter your employee number.",
  validIdNumberInvalid: "Enter the number on your valid ID.",
  idTypeInvalid: "Choose one of the listed ID types, or leave it empty.",
  institutionRequired: "Enter your school or institution name.",
  contactNumberRequired: "Enter your contact number.",
  yearGraduatedRequired: "Select the year you graduated.",
  alumniIdNumberInvalid: "Enter your alumni ID number.",
  termsRequired: "Accept the terms to create your account.",
  codeInvalid: "Enter the 6-digit code from your email.",
} as const;

const trimmed = z.string().trim();

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: SIGN_UP_MESSAGES.emailInvalid }).max(320, { error: SIGN_UP_MESSAGES.emailInvalid }));

/** 72 is the most that bcrypt, which Supabase Auth uses, will read. */
export const passwordSchema = z
  .string()
  .min(8, { error: SIGN_UP_MESSAGES.passwordTooShort })
  .max(72, { error: SIGN_UP_MESSAGES.passwordTooLong });

export const nameSchema = trimmed
  .min(1, { error: SIGN_UP_MESSAGES.nameRequired })
  .max(60, { error: SIGN_UP_MESSAGES.nameTooLong });

/** A name that may be left empty. An empty value means "none". */
export const optionalNameSchema = trimmed
  .max(60, { error: SIGN_UP_MESSAGES.nameTooLong })
  .transform((value) => (value === "" ? undefined : value)).optional();

export const usernameSchema = trimmed.regex(/^[A-Za-z0-9_.]{3,30}$/, { error: SIGN_UP_MESSAGES.usernameInvalid });

const CONTACT_NUMBER_PATTERN = /^\+?[0-9][0-9 -]{5,18}[0-9]$/;

/** Digits with an optional leading plus, and spaces or dashes between them. Empty means "none". */
export const contactNumberSchema = trimmed
  .refine((value) => value === "" || CONTACT_NUMBER_PATTERN.test(value), {
    error: SIGN_UP_MESSAGES.contactNumberInvalid,
  })
  .transform((value) => (value === "" ? undefined : value))
  .optional();

/** How many digits the emailed verification code has. */
export const VERIFICATION_CODE_LENGTH = 6;

export const verificationCodeSchema = z
  .string()
  .trim()
  .regex(new RegExp(`^\\d{${VERIFICATION_CODE_LENGTH}}$`), { error: SIGN_UP_MESSAGES.codeInvalid });

/** The colleges in the Figma college list. A data change, not a code change, when UMAK adds one. */
export const UMAK_COLLEGES = ["CLAS", "CHK", "CBFS", "CCIS", "CITE", "CITE-HSU", "CGPP", "CCSE", "CET"] as const;
export const umakCollegeSchema = z.enum(UMAK_COLLEGES, { error: SIGN_UP_MESSAGES.collegeRequired });
export type UmakCollege = z.infer<typeof umakCollegeSchema>;

/** `K` and 7 to 9 digits, as in K12256165. Stored in capitals. The real format is pending the library's confirmation. */
export const studentNumberSchema = trimmed
  .toUpperCase()
  .regex(/^K\d{7,9}$/, { error: SIGN_UP_MESSAGES.studentNumberInvalid });

/** What only a UMAK Student gives at sign-up. */
export const umakStudentDetailsSchema = z.object({
  studentNumber: studentNumberSchema,
  college: umakCollegeSchema,
});
export type UmakStudentDetails = z.infer<typeof umakStudentDetailsSchema>;

/**
 * An ID number as printed: letters, digits, spaces, dots and dashes, 3 to 30
 * characters. The real formats are not published, so this only rules out
 * empty or obviously wrong values; it is not a check that the number exists.
 */
function idNumberSchema(message: string) {
  return trimmed.regex(/^[A-Za-z0-9][A-Za-z0-9 .-]{1,28}[A-Za-z0-9]$/, { error: message });
}

/** What only a Faculty member gives at sign-up (Figma "Faculty number" and college). */
export const facultyDetailsSchema = z.object({
  facultyNumber: idNumberSchema(SIGN_UP_MESSAGES.facultyNumberInvalid),
  college: umakCollegeSchema,
});
export type FacultyDetails = z.infer<typeof facultyDetailsSchema>;

/** What only an NTP / Employee gives at sign-up. The design reuses the Faculty form: a number and a college. */
export const ntpEmployeeDetailsSchema = z.object({
  employeeNumber: idNumberSchema(SIGN_UP_MESSAGES.employeeNumberInvalid),
  college: umakCollegeSchema,
});
export type NtpEmployeeDetails = z.infer<typeof ntpEmployeeDetailsSchema>;

/** The ID types in the Figma list for a Visitor. */
export const VISITOR_ID_TYPES = [
  "PhilID (National ID)",
  "Passport",
  "Driver’s License",
  "UMID",
  "Postal ID",
  "Voter’s ID",
  "PRC ID",
  "School ID (current)",
  "Other",
] as const;
export const visitorIdTypeSchema = z.enum(VISITOR_ID_TYPES, { error: SIGN_UP_MESSAGES.idTypeInvalid });
export type VisitorIdType = z.infer<typeof visitorIdTypeSchema>;

/** What only a Visitor gives at sign-up. The design does not mark the ID type as required. */
export const visitorDetailsSchema = z.object({
  validIdNumber: idNumberSchema(SIGN_UP_MESSAGES.validIdNumberInvalid),
  idType: visitorIdTypeSchema.optional(),
  institution: trimmed
    .min(1, { error: SIGN_UP_MESSAGES.institutionRequired })
    .max(120, { error: SIGN_UP_MESSAGES.institutionRequired }),
});
export type VisitorDetails = z.infer<typeof visitorDetailsSchema>;

/** The graduation years in the Figma list for Alumni. A data change, not a code change, when a year is added. */
export const ALUMNI_GRADUATION_YEARS = [
  "2018-2019",
  "2019-2020",
  "2020-2021",
  "2021-2022",
  "2022-2023",
  "2023-2024",
  "2024-2025",
  "2025-2026",
  "Other",
] as const;
export const yearGraduatedSchema = z.enum(ALUMNI_GRADUATION_YEARS, { error: SIGN_UP_MESSAGES.yearGraduatedRequired });
export type YearGraduated = z.infer<typeof yearGraduatedSchema>;

/** What only an Alumni gives at sign-up. */
export const alumniDetailsSchema = z.object({
  yearGraduated: yearGraduatedSchema,
  alumniIdNumber: idNumberSchema(SIGN_UP_MESSAGES.alumniIdNumberInvalid),
});
export type AlumniDetails = z.infer<typeof alumniDetailsSchema>;

/** A contact number that cannot be left empty: a Visitor's form marks it required. */
export const requiredContactNumberSchema = z
  .string({ error: SIGN_UP_MESSAGES.contactNumberRequired })
  .trim()
  .min(1, { error: SIGN_UP_MESSAGES.contactNumberRequired })
  .regex(CONTACT_NUMBER_PATTERN, { error: SIGN_UP_MESSAGES.contactNumberInvalid });

/** The fields every Account Type gives at sign-up. */
const commonSignUpFields = {
  email: emailSchema,
  password: passwordSchema,
  firstName: nameSchema,
  middleName: optionalNameSchema,
  lastName: nameSchema,
  username: usernameSchema,
  contactNumber: contactNumberSchema,
  /** Must be true: the person has seen and accepted the terms. */
  acceptedTerms: z.literal(true, { error: SIGN_UP_MESSAGES.termsRequired }),
};

/** UMAK addresses only: applied to every Account Type that requires one. */
function umakEmailRule<T extends { accountType: AccountType; email: string }>(ctx: z.core.ParsePayload<T>): void {
  const { accountType, email } = ctx.value;
  if (requiresUmakEmail(accountType) && !isUmakEmail(email)) {
    ctx.issues.push({
      code: "custom",
      input: ctx.value,
      path: ["email"],
      message: SIGN_UP_MESSAGES.umakEmailRequired,
    });
  }
}

export const umakStudentSignUpSchema = z
  .object({
    accountType: z.literal("umak_student"),
    ...commonSignUpFields,
    details: umakStudentDetailsSchema,
  })
  .check(umakEmailRule);

export const facultySignUpSchema = z
  .object({
    accountType: z.literal("faculty"),
    ...commonSignUpFields,
    details: facultyDetailsSchema,
  })
  .check(umakEmailRule);

export const ntpEmployeeSignUpSchema = z
  .object({
    accountType: z.literal("ntp_employee"),
    ...commonSignUpFields,
    details: ntpEmployeeDetailsSchema,
  })
  .check(umakEmailRule);

/** Any email is accepted, so there is no UMAK rule. A Visitor must give a contact number. */
export const visitorSignUpSchema = z.object({
  accountType: z.literal("visitor"),
  ...commonSignUpFields,
  contactNumber: requiredContactNumberSchema,
  details: visitorDetailsSchema,
});

/** Any email is accepted, so there is no UMAK rule. */
export const alumniSignUpSchema = z.object({
  accountType: z.literal("alumni"),
  ...commonSignUpFields,
  details: alumniDetailsSchema,
});

/**
 * What the app sends to `POST /members/sign-up`: one member per Account Type,
 * told apart by `accountType`, each with the details its Figma form collects.
 */
export const signUpRequestSchema = z.discriminatedUnion("accountType", [
  umakStudentSignUpSchema,
  facultySignUpSchema,
  ntpEmployeeSignUpSchema,
  visitorSignUpSchema,
  alumniSignUpSchema,
]);
export type SignUpRequest = z.input<typeof signUpRequestSchema>;
export type ParsedSignUpRequest = z.output<typeof signUpRequestSchema>;

export const verifySignUpRequestSchema = z.object({
  email: emailSchema,
  code: verificationCodeSchema,
});
export type VerifySignUpRequest = z.input<typeof verifySignUpRequestSchema>;

export const resendSignUpCodeRequestSchema = z.object({ email: emailSchema });
export type ResendSignUpCodeRequest = z.input<typeof resendSignUpCodeRequestSchema>;
