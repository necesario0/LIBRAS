import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type {
  AccountType,
  MemberProfile,
  SignUpCodeSentResponse,
  UmakCollege,
  VisitorIdType,
  YearGraduated,
} from "@libras/shared";

/** Everything the person has typed so far. It lives only while they are signing up. */
export interface SignUpDraft {
  accountType: AccountType;
  firstName: string;
  middleName: string;
  lastName: string;
  studentNumber: string;
  facultyNumber: string;
  employeeNumber: string;
  /** Shared by UMAK Student, Faculty and NTP / Employee: all three pick from the same college list. */
  college: UmakCollege | undefined;
  validIdNumber: string;
  idType: VisitorIdType | undefined;
  institution: string;
  yearGraduated: YearGraduated | undefined;
  alumniIdNumber: string;
  contactNumber: string;
  username: string;
  password: string;
  confirmPassword: string;
  email: string;
  acceptedTerms: boolean;
}

const EMPTY_DRAFT: SignUpDraft = {
  accountType: "umak_student",
  firstName: "",
  middleName: "",
  lastName: "",
  studentNumber: "",
  facultyNumber: "",
  employeeNumber: "",
  college: undefined,
  validIdNumber: "",
  idType: undefined,
  institution: "",
  yearGraduated: undefined,
  alumniIdNumber: "",
  contactNumber: "",
  username: "",
  password: "",
  confirmPassword: "",
  email: "",
  acceptedTerms: false,
};

/** A fix the API asked for that belongs to an earlier step, such as a username that is taken. */
export type FieldErrors = Partial<Record<"username" | "studentNumber", string>>;

interface SignUpState {
  draft: SignUpDraft;
  update: (patch: Partial<SignUpDraft>) => void;
  /** The code that was just emailed: set once the API accepted the sign-up. */
  pending: SignUpCodeSentResponse | undefined;
  setPending: (pending: SignUpCodeSentResponse | undefined) => void;
  /** The new Member, once the code was accepted. */
  member: MemberProfile | undefined;
  setMember: (member: MemberProfile | undefined) => void;
  fieldErrors: FieldErrors;
  setFieldErrors: (errors: FieldErrors) => void;
  /** Forgets everything, so the next sign-up starts empty. */
  reset: () => void;
}

const SignUpContext = createContext<SignUpState | undefined>(undefined);

export function SignUpProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<SignUpDraft>(EMPTY_DRAFT);
  const [pending, setPending] = useState<SignUpCodeSentResponse | undefined>(undefined);
  const [member, setMember] = useState<MemberProfile | undefined>(undefined);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const update = useCallback((patch: Partial<SignUpDraft>) => setDraft((current) => ({ ...current, ...patch })), []);
  const reset = useCallback(() => {
    setDraft(EMPTY_DRAFT);
    setPending(undefined);
    setMember(undefined);
    setFieldErrors({});
  }, []);

  const value = useMemo<SignUpState>(
    () => ({ draft, update, pending, setPending, member, setMember, fieldErrors, setFieldErrors, reset }),
    [draft, update, pending, member, fieldErrors, reset],
  );
  return <SignUpContext.Provider value={value}>{children}</SignUpContext.Provider>;
}

export function useSignUp(): SignUpState {
  const state = useContext(SignUpContext);
  if (!state) throw new Error("useSignUp must be used inside the sign-up screens");
  return state;
}
