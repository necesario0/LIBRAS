import type { ApiErrorBody, HealthResponse } from "@libras/shared";

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

  return {
    getHealth: () => request<HealthResponse>("/health"),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
