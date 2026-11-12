import type {
  ConfirmLoanResponse,
  DeskMember,
  IdentifyMemberResponse,
  RecordReturnResponse,
  RefreshSessionResponse,
  ReturnedLoan,
  Session,
  StaffMeResponse,
  StaffProfile,
  StaffSignInResponse,
} from "@libras/shared";
import { clearSession, loadSession, saveSession } from "./session.ts";

/** Where the API is. `/api` is proxied to the API by Vite in development and by the host in production. */
const API_BASE = import.meta.env.VITE_API_URL ?? "/api";

/** An error response from the API: a stable `code` and a `message` that is safe to show. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

async function send(path: string, init: RequestInit & { session?: Session }): Promise<Response> {
  const { session, headers, ...rest } = init;
  try {
    return await fetch(`${API_BASE}${path}`, {
      ...rest,
      headers: {
        ...(rest.body === undefined ? {} : { "content-type": "application/json" }),
        ...(session ? { authorization: `Bearer ${session.accessToken}` } : {}),
        ...headers,
      },
    });
  } catch {
    throw new ApiError(0, "unreachable", "We could not reach the server. Check your connection and try again.");
  }
}

async function failure(response: Response): Promise<ApiError> {
  const body: unknown = await response.json().catch(() => undefined);
  const error = (body as { error?: { code?: unknown; message?: unknown } } | undefined)?.error;
  if (typeof error?.code === "string" && typeof error.message === "string") {
    return new ApiError(response.status, error.code, error.message);
  }
  return new ApiError(response.status, "unexpected", "Something went wrong. Please try again.");
}

/** Signs a Librarian in. Throws ApiError: `invalid_credentials`, `not_staff`, `invalid_request` or `unreachable`. */
export async function signIn(email: string, password: string): Promise<StaffProfile> {
  const response = await send("/staff/sign-in", { method: "POST", body: JSON.stringify({ email, password }) });
  if (!response.ok) throw await failure(response);
  const body = (await response.json()) as StaffSignInResponse;
  saveSession(body.session);
  return body.staff;
}

/** Ends the session on the server and in this browser. Never throws: the person is signed out either way. */
export async function signOut(): Promise<void> {
  const session = loadSession();
  clearSession();
  if (!session) return;
  try {
    await send("/auth/sign-out", { method: "POST", session });
  } catch {
    // The token expires by itself, and the browser has already forgotten it.
  }
}

async function refresh(session: Session): Promise<Session | undefined> {
  const response = await send("/auth/refresh", {
    method: "POST",
    body: JSON.stringify({ refreshToken: session.refreshToken }),
  });
  if (!response.ok) return undefined;
  const body = (await response.json()) as RefreshSessionResponse;
  saveSession(body.session);
  return body.session;
}

/**
 * Calls a Librarian-only endpoint with the stored session, renewing the
 * session once if the access token has expired. Returns undefined when there
 * is no usable session left, and the caller shows the sign-in page.
 */
async function authorized(path: string, init: RequestInit = {}): Promise<Response | undefined> {
  let session = loadSession();
  if (!session) return undefined;
  let response = await send(path, { ...init, session });
  if (response.status === 401) {
    session = await refresh(session);
    if (!session) {
      clearSession();
      return undefined;
    }
    response = await send(path, { ...init, session });
  }
  return response;
}

/**
 * The Member a Digital ID belongs to, with their Account Type and Loans against
 * their limit. `code` is the canonical 12 digits from the scan input point.
 * Returns undefined when the Librarian's session is gone. Throws ApiError:
 * `digital_id_expired`, `digital_id_invalid`, `invalid_request` or `unreachable`.
 */
export async function identifyMember(code: string): Promise<DeskMember | undefined> {
  const response = await authorized("/desk/members/identify", { method: "POST", body: JSON.stringify({ code }) });
  if (!response) return undefined;
  if (!response.ok) throw await failure(response);
  return ((await response.json()) as IdentifyMemberResponse).member;
}

/**
 * Confirms a Loan for the Member whose Digital ID was scanned: `digitalId` is
 * that code and `copy` is the Copy's barcode or accession number from the scan
 * input point. Resolves with the Loan and the Member with the Loan counted, or
 * undefined when the Librarian's session is gone. Throws ApiError with the
 * reason to show: `loan_limit_reached`, `cannot_borrow`, `copy_on_loan`,
 * `copy_set_aside`, `copy_not_found`, `digital_id_expired`, `digital_id_invalid`,
 * `digital_id_used`, `invalid_request` or `unreachable`.
 */
export async function confirmLoan(digitalId: string, copy: string): Promise<ConfirmLoanResponse | undefined> {
  const response = await authorized("/desk/loans", { method: "POST", body: JSON.stringify({ digitalId, copy }) });
  if (!response) return undefined;
  if (!response.ok) throw await failure(response);
  return (await response.json()) as ConfirmLoanResponse;
}

/**
 * The Librarian the stored session belongs to, or undefined when nobody is
 * signed in (no session, expired, signed out elsewhere, or not staff).
 */
export async function currentStaff(): Promise<StaffProfile | undefined> {
  const response = await authorized("/staff/me");
  if (!response) return undefined;
  if (response.status === 401 || response.status === 403) {
    clearSession();
    return undefined;
  }
  if (!response.ok) throw await failure(response);
  return ((await response.json()) as StaffMeResponse).staff;
}

/**
 * Records the return of a Copy: `copy` is its barcode or accession number from
 * the scan input point, with no Member involved. Resolves with the closed Loan,
 * or undefined when the Librarian's session is gone. Throws ApiError with the
 * reason to show: `copy_not_on_loan`, `copy_not_found`, `return_conflict`,
 * `invalid_request` or `unreachable`.
 */
export async function recordReturn(copy: string): Promise<ReturnedLoan | undefined> {
  const response = await authorized("/desk/returns", { method: "POST", body: JSON.stringify({ copy }) });
  if (!response) return undefined;
  if (!response.ok) throw await failure(response);
  return ((await response.json()) as RecordReturnResponse).loan;
}
