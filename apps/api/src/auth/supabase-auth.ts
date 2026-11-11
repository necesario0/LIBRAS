import { AppError } from "../errors.ts";
import type { AuthProvider, Identity, SignedIn } from "./auth-provider.ts";

export interface SupabaseAuthOptions {
  /** The Supabase project URL, for example https://abc.supabase.co. */
  url: string;
  /** The publishable (anon) key. It only lets the API reach the public Auth endpoints. */
  publishableKey: string;
}

const REQUEST_TIMEOUT_MS = 10_000;

/** The codes Supabase Auth uses to say "these credentials or this token are no good". */
const REFUSAL_CODES = new Set([
  "invalid_credentials",
  "refresh_token_not_found",
  "refresh_token_already_used",
  "session_not_found",
  "session_expired",
  "bad_jwt",
  "no_authorization",
  "user_not_found",
  "user_banned",
]);

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function identityFrom(user: unknown): Identity {
  if (!isRecord(user) || typeof user.id !== "string" || typeof user.email !== "string") {
    throw new Error("Supabase Auth returned a user without an id and email");
  }
  return { userId: user.id, email: user.email };
}

function signedInFrom(body: unknown): SignedIn {
  if (
    !isRecord(body) ||
    typeof body.access_token !== "string" ||
    typeof body.refresh_token !== "string" ||
    typeof body.expires_at !== "number"
  ) {
    throw new Error("Supabase Auth returned a session in an unexpected shape");
  }
  return {
    identity: identityFrom(body.user),
    session: {
      accessToken: body.access_token,
      refreshToken: body.refresh_token,
      expiresAt: new Date(body.expires_at * 1000).toISOString(),
    },
  };
}

/** Supabase Auth over HTTP. */
export class SupabaseAuth implements AuthProvider {
  readonly #authUrl: string;
  readonly #publishableKey: string;

  constructor(options: SupabaseAuthOptions) {
    this.#authUrl = `${options.url.replace(/\/+$/, "")}/auth/v1`;
    this.#publishableKey = options.publishableKey;
  }

  async signInWithPassword(email: string, password: string): Promise<SignedIn | undefined> {
    const body = await this.#request("POST", "/token?grant_type=password", { body: { email, password } });
    return body === undefined ? undefined : signedInFrom(body);
  }

  async refresh(refreshToken: string): Promise<SignedIn | undefined> {
    // Supabase answers a malformed refresh token with validation_failed: for a
    // token that is the same as an unknown one.
    const body = await this.#request(
      "POST",
      "/token?grant_type=refresh_token",
      { body: { refresh_token: refreshToken } },
      ["validation_failed"],
    );
    return body === undefined ? undefined : signedInFrom(body);
  }

  async identify(accessToken: string): Promise<Identity | undefined> {
    // Asking Supabase Auth, instead of only checking the token signature,
    // means a signed-out session stops working at once.
    const body = await this.#request("GET", "/user", { accessToken });
    return body === undefined ? undefined : identityFrom(body);
  }

  async signOut(accessToken: string): Promise<void> {
    await this.#request("POST", "/logout?scope=local", { accessToken });
  }

  /** Returns the parsed body, or undefined when Supabase Auth refused the credentials or the token. */
  async #request(
    method: "GET" | "POST",
    path: string,
    options: { body?: unknown; accessToken?: string },
    extraRefusalCodes: readonly string[] = [],
  ): Promise<unknown> {
    let response: Response;
    try {
      response = await fetch(`${this.#authUrl}${path}`, {
        method,
        headers: {
          apikey: this.#publishableKey,
          ...(options.accessToken ? { authorization: `Bearer ${options.accessToken}` } : {}),
          ...(options.body === undefined ? {} : { "content-type": "application/json" }),
        },
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      throw new AppError(503, "auth_unavailable", "Sign-in is temporarily unavailable. Please try again.", {
        cause: error,
      });
    }

    if (response.status === 204) return null;
    const body: unknown = await response.json().catch(() => undefined);
    if (response.ok) return body;

    if (response.status === 429) {
      throw new AppError(429, "too_many_attempts", "Too many attempts. Please wait a minute and try again.");
    }
    const code = isRecord(body) && typeof body.error_code === "string" ? body.error_code : undefined;
    if (code !== undefined && (REFUSAL_CODES.has(code) || extraRefusalCodes.includes(code))) return undefined;
    throw new Error(`Supabase Auth ${method} ${path} failed with ${response.status} ${code ?? "(no code)"}`);
  }
}
