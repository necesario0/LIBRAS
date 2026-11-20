import { catalogSearchQueryString } from "@libras/shared";
import type {
  ApiErrorBody,
  BookDetailResponse,
  CancelHoldResponse,
  CatalogSearchFilters,
  CatalogSearchResponse,
  CatalogSubjectsResponse,
  CatalogSuggestionsResponse,
  ChangePasswordRequest,
  CheckPasswordResetCodeRequest,
  ClearanceResponse,
  CompletePasswordResetRequest,
  DeleteAccountRequest,
  DigitalIdResponse,
  HealthResponse,
  HomeResponse,
  MemberLoanPolicyResponse,
  MemberMeResponse,
  MemberSignInResponse,
  MyHoldsResponse,
  MyLoansResponse,
  MyNotificationsResponse,
  MySavedBooksResponse,
  NotificationsUnreadResponse,
  PasswordResetRequestedResponse,
  PlaceHoldResponse,
  PushSettingsChange,
  PushSettingsResponse,
  RefreshSessionResponse,
  RenewLoanResponse,
  SaveBookResponse,
  RequestPasswordResetRequest,
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
     * No match is a normal answer with an empty `results`, not an error. `filters` sorts the
     * results, keeps only what is on the shelf now, narrows by Subject and year, and folds older editions.
     */
    searchCatalog: (accessToken: string, query: string, filters: CatalogSearchFilters, limit?: number) =>
      request<CatalogSearchResponse>(`/catalog/search?${catalogSearchQueryString(query, filters, limit)}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
    /** Up to 5 title and author suggestions for a query of at least 2 characters (`invalid_request`, 400, when it is shorter). */
    suggestCatalog: (accessToken: string, query: string) =>
      request<CatalogSuggestionsResponse>(`/catalog/suggestions?q=${encodeURIComponent(query)}`, { headers: bearer(accessToken) }),
    /** The Subjects that have at least one Book in the catalog, in table order: the options of the Filters sheet. */
    getSubjects: (accessToken: string) => request<CatalogSubjectsResponse>("/catalog/subjects", { headers: bearer(accessToken) }),
    /** What Home shows besides the search bar: the shelves (the Announcement joins them later). A shelf with no Books is not in the answer. */
    getHome: (accessToken: string) => request<HomeResponse>("/home", { headers: bearer(accessToken) }),
    /** One Book with its details and how many Copies exist and are available. `book_not_found` (404) when there is no such Book. */
    getBook: (accessToken: string, id: string) =>
      request<BookDetailResponse>(`/catalog/books/${encodeURIComponent(id)}`, { headers: bearer(accessToken) }),
    /**
     * Puts the Member in the queue of a Book that has no available Copy. Failures: `cannot_borrow` (403),
     * `book_not_found` (404), `copy_available`, `book_on_loan` and `hold_exists` (409).
     */
    placeHold: (accessToken: string, bookId: string) => post<PlaceHoldResponse>("/holds", { bookId }, accessToken),
    /** The Member's own Holds, active ones first. */
    getHolds: (accessToken: string) => request<MyHoldsResponse>("/members/me/holds", { headers: bearer(accessToken) }),
    /** Takes the Member out of a Book's queue. Failures: `hold_not_found` (404), `hold_not_cancellable` (409). */
    cancelHold: (accessToken: string, holdId: string) =>
      request<CancelHoldResponse>(`/holds/${encodeURIComponent(holdId)}/cancel`, { method: "POST", headers: bearer(accessToken) }),
    /** The Member's own Saved books, newest first, with each Book's availability. */
    getSavedBooks: (accessToken: string) => request<MySavedBooksResponse>("/members/me/saved-books", { headers: bearer(accessToken) }),
    /** Saves a Book (saving again changes nothing). `book_not_found` (404) when there is no such Book. */
    saveBook: (accessToken: string, bookId: string) =>
      request<SaveBookResponse>(`/members/me/saved-books/${encodeURIComponent(bookId)}`, { method: "PUT", headers: bearer(accessToken) }),
    /** Takes a Book off the Member's Saved books (succeeds when it was not there). */
    unsaveBook: (accessToken: string, bookId: string) =>
      request<SaveBookResponse>(`/members/me/saved-books/${encodeURIComponent(bookId)}`, { method: "DELETE", headers: bearer(accessToken) }),
    /** Which kinds of push notification the Member gets. */
    getPushSettings: (accessToken: string) => request<PushSettingsResponse>("/members/me/push-settings", { headers: bearer(accessToken) }),
    /** Turns the named push notification switches on or off; answers all of them. */
    changePushSettings: (accessToken: string, change: PushSettingsChange) =>
      request<PushSettingsResponse>("/members/me/push-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...bearer(accessToken) },
        body: JSON.stringify(change),
      }),
    /** This phone gets the signed-in Member's push notifications (repeating it is harmless). */
    registerPushDevice: (accessToken: string, token: string) =>
      request<null>("/members/me/push-device", {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...bearer(accessToken) },
        body: JSON.stringify({ token }),
      }),
    /** A page of the Member's Notifications, newest first; `before` is the `nextCursor` of the page before. */
    getNotifications: (accessToken: string, before?: string) =>
      request<MyNotificationsResponse>(`/members/me/notifications${before === undefined ? "" : `?before=${encodeURIComponent(before)}`}`, {
        headers: bearer(accessToken),
      }),
    /** How many of the Member's Notifications are unread: the badge on the Home bell. */
    getUnreadNotifications: (accessToken: string) =>
      request<NotificationsUnreadResponse>("/members/me/notifications/unread", { headers: bearer(accessToken) }),
    /** Marks one Notification read (again is harmless) and answers the unread count. `notification_not_found` (404). */
    markNotificationRead: (accessToken: string, id: string) =>
      request<NotificationsUnreadResponse>(`/members/me/notifications/${encodeURIComponent(id)}/read`, {
        method: "POST",
        headers: bearer(accessToken),
      }),
    /** Marks every Notification of the Member read and answers the unread count. */
    markAllNotificationsRead: (accessToken: string) =>
      request<NotificationsUnreadResponse>("/members/me/notifications/read-all", { method: "POST", headers: bearer(accessToken) }),
    /** The Member's own Loans, current ones first, with the loan limit and loan period of their Loan Policy. */
    getLoans: (accessToken: string) => request<MyLoansResponse>("/members/me/loans", { headers: bearer(accessToken) }),
    /**
     * Renews one of the Member's Loans: its due date moves one loan period later. Failures: `loan_not_found` (404),
     * `loan_returned`, `loan_overdue`, `renewal_limit_reached`, `hold_waiting`, `overdue_loan` and `unsettled_fine` (409).
     */
    renewLoan: (accessToken: string, loanId: string) =>
      request<RenewLoanResponse>(`/loans/${encodeURIComponent(loanId)}/renew`, { method: "POST", headers: bearer(accessToken) }),
    /** Whether the Member is cleared, with the Loans still out and the unsettled Fines that stand in the way. */
    getClearance: (accessToken: string) => request<ClearanceResponse>("/members/me/clearance", { headers: bearer(accessToken) }),
    /** The Loan Policy of the Member's Account Type: loan limit and period, renewal limit, daily Fine rate and Fine cap. */
    getLoanPolicy: (accessToken: string) =>
      request<MemberLoanPolicyResponse>("/members/me/loan-policy", { headers: bearer(accessToken) }),
    /** Ends every session of the Member's account, this one included. The app signs out locally afterwards. */
    signOutAllDevices: (accessToken: string) =>
      request<null>("/members/me/sign-out-all", { method: "POST", headers: bearer(accessToken) }),
    /**
     * Deletes the Member's account, confirmed with their password (only when cleared). Failures:
     * `not_cleared` (409, with the Clearance reason), `password_incorrect` (403), `too_many_attempts` (429).
     */
    deleteAccount: (accessToken: string, body: DeleteAccountRequest) =>
      request<null>("/members/me/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...bearer(accessToken) },
        body: JSON.stringify(body),
      }),
    /** Starts a sign-up: the API emails a verification code. */
    signUp: (body: SignUpRequest) => post<SignUpCodeSentResponse>("/members/sign-up", body),
    /** Accepts the emailed code: the account is active from here on. */
    verifySignUp: (body: VerifySignUpRequest) => post<VerifySignUpResponse>("/members/sign-up/verify", body),
    /** Emails a new code. The old one stops working. */
    resendSignUpCode: (body: ResendSignUpCodeRequest) => post<SignUpCodeSentResponse>("/members/sign-up/resend", body),
    /**
     * Forgot password: emails a code when the address belongs to a Member. The reply is the same for any
     * address. Failure: `too_many_attempts` (429) when too many codes were asked for.
     */
    requestPasswordReset: (body: RequestPasswordResetRequest) =>
      post<PasswordResetRequestedResponse>("/members/password-reset", body),
    /** Checks the emailed code before the new password is asked for. Failures: `invalid_code`, `code_expired`, `too_many_attempts`. */
    checkPasswordResetCode: (body: CheckPasswordResetCodeRequest) => post<null>("/members/password-reset/check", body),
    /**
     * Sets the new password. Every session of the account ends and nobody is signed in. Failures: the code ones,
     * `invalid_password` when the password breaks the sign-up rules, and `password_reset_unfinished` (503) when the
     * password could not be set: the code is spent, so the Member asks for a new one.
     */
    completePasswordReset: (body: CompletePasswordResetRequest) => post<null>("/members/password-reset/complete", body),
    /**
     * Changes the signed-in Member's password. Every other session of the account ends; this one stays. Failures:
     * `current_password_incorrect` (403), `invalid_password` (400: the sign-up rules, or the same password) and
     * `too_many_attempts` (429, shared with sign-in).
     */
    changePassword: (accessToken: string, body: ChangePasswordRequest) =>
      request<null>("/members/me/password", {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...bearer(accessToken) },
        body: JSON.stringify(body),
      }),
    /** Signs a Member in. Failures: `invalid_credentials`, `email_not_verified`, `too_many_attempts`. */
    signIn: (body: SignInRequest) => post<MemberSignInResponse>("/members/sign-in", body),
    /** Swaps a refresh token for a new session. A refresh token works once. */
    refreshSession: (refreshToken: string) => post<RefreshSessionResponse>("/auth/refresh", { refreshToken }),
    /**
     * Ends the session on the server. Never fails for a session that is already gone. With this phone's
     * push token the phone also stops getting push notifications; that works without a session.
     */
    signOut: (accessToken: string | undefined, pushToken?: string) =>
      post<null>("/auth/sign-out", pushToken === undefined ? {} : { pushToken }, accessToken),
    /** The signed-in Member's profile. `not_signed_in` (401) when the access token no longer works. */
    getMe: (accessToken: string) => request<MemberMeResponse>("/members/me", { headers: bearer(accessToken) }),
    /** The Member's Digital ID for the current 60-second window. */
    getDigitalId: (accessToken: string) =>
      request<DigitalIdResponse>("/members/me/digital-id", { headers: bearer(accessToken) }),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
