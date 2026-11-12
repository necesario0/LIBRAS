import type {
  ApiErrorBody,
  BookDetailResponse,
  CancelHoldResponse,
  CatalogSearchResponse,
  DigitalIdResponse,
  HealthResponse,
  MemberMeResponse,
  MemberSignInResponse,
  MyHoldsResponse,
  MyLoansResponse,
  PlaceHoldResponse,
  RefreshSessionResponse,
  ResendSignUpCodeRequest,
  SignInRequest,
  SignUpCodeSentResponse,
  SignUpRequest,
  VerifySignUpRequest,
  VerifySignUpResponse,
} from "@libras/shared";

/** A failure a Member can be shown: `message` is safe text, `code` is stable. */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export const NETWORK_ERROR_CODE = "network_error";

function isErrorBody(value: unknown): value is ApiErrorBody {
  if (typeof value !== "object" || value === null || !("error" in value)) return false;
  const error = (value as { error: unknown }).error;
  return (
    typeof error === "object" &&
    error !== null &&
    typeof (error as { code?: unknown }).code === "string" &&
    typeof (error as { message?: unknown }).message === "string"
  );
}

export interface ApiClientOptions {
  baseUrl: string;
  fetch?: typeof fetch;
  /** Milliseconds before a request is abandoned. */
  timeoutMs?: number;
}

/**
 * The only way the app talks to the backend. Every endpoint is a method here;
 * every failure, including no network, surfaces as an `ApiError`.
 */
export function createApiClient({ baseUrl, fetch: fetchImpl = fetch, timeoutMs = 10_000 }: ApiClientOptions) {
  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, {
        ...init,
        headers: { Accept: "application/json", ...init.headers },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new ApiError(0, NETWORK_ERROR_CODE, "Cannot reach the library service. Check your connection and try again.");
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = undefined;
    }
    if (!response.ok) {
      if (isErrorBody(body)) throw new ApiError(response.status, body.error.code, body.error.message);
      throw new ApiError(response.status, "unexpected_response", "The library service sent an unexpected reply. Please try again.");
    }
    return body as T;
  }

  const bearer = (accessToken: string) => ({ Authorization: `Bearer ${accessToken}` });
  const post = <T>(path: string, body: unknown, accessToken?: string) =>
    request<T>(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(accessToken === undefined ? {} : bearer(accessToken)) },
      body: JSON.stringify(body),
    });

  return {
    getHealth: () => request<HealthResponse>("/health"),
    /**
     * Searches the catalog by title or author (typos are tolerated) or by ISBN,
     * accession number or call number. Needs a signed-in Member's access token.
     * No match is a normal answer with an empty `results`, not an error.
     */
    searchCatalog: (accessToken: string, query: string, limit?: number) =>
      request<CatalogSearchResponse>(
        `/catalog/search?q=${encodeURIComponent(query)}${limit === undefined ? "" : `&limit=${limit}`}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      ),
    /** One Book with its details and how many Copies exist and are available. `book_not_found` (404) when there is no such Book. */
    getBook: (accessToken: string, id: string) =>
      request<BookDetailResponse>(`/catalog/books/${encodeURIComponent(id)}`, { headers: bearer(accessToken) }),
    /**
     * Puts the Member in the queue of a Book that has no available Copy. Failures: `cannot_borrow` (403),
     * `book_not_found` (404), `copy_available` and `hold_exists` (409).
     */
    placeHold: (accessToken: string, bookId: string) => post<PlaceHoldResponse>("/holds", { bookId }, accessToken),
    /** The Member's own Holds, active ones first. */
    getHolds: (accessToken: string) => request<MyHoldsResponse>("/members/me/holds", { headers: bearer(accessToken) }),
    /** Takes the Member out of a Book's queue. Failures: `hold_not_found` (404), `hold_not_cancellable` (409). */
    cancelHold: (accessToken: string, holdId: string) =>
      request<CancelHoldResponse>(`/holds/${encodeURIComponent(holdId)}/cancel`, { method: "POST", headers: bearer(accessToken) }),
    /** The Member's own Loans, current ones first, with the loan limit and loan period of their Loan Policy. */
    getLoans: (accessToken: string) => request<MyLoansResponse>("/members/me/loans", { headers: bearer(accessToken) }),
    /** Starts a sign-up: the API emails a verification code. */
    signUp: (body: SignUpRequest) => post<SignUpCodeSentResponse>("/members/sign-up", body),
    /** Accepts the emailed code: the account is active from here on. */
    verifySignUp: (body: VerifySignUpRequest) => post<VerifySignUpResponse>("/members/sign-up/verify", body),
    /** Emails a new code. The old one stops working. */
    resendSignUpCode: (body: ResendSignUpCodeRequest) => post<SignUpCodeSentResponse>("/members/sign-up/resend", body),
    /** Signs a Member in. Failures: `invalid_credentials`, `email_not_verified`, `too_many_attempts`. */
    signIn: (body: SignInRequest) => post<MemberSignInResponse>("/members/sign-in", body),
    /** Swaps a refresh token for a new session. A refresh token works once. */
    refreshSession: (refreshToken: string) => post<RefreshSessionResponse>("/auth/refresh", { refreshToken }),
    /** Ends the session on the server. Never fails for a session that is already gone. */
    signOut: (accessToken: string) =>
      request<null>("/auth/sign-out", { method: "POST", headers: bearer(accessToken) }),
    /** The signed-in Member's profile. `not_signed_in` (401) when the access token no longer works. */
    getMe: (accessToken: string) => request<MemberMeResponse>("/members/me", { headers: bearer(accessToken) }),
    /** The Member's Digital ID for the current 60-second window. */
    getDigitalId: (accessToken: string) =>
      request<DigitalIdResponse>("/members/me/digital-id", { headers: bearer(accessToken) }),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
