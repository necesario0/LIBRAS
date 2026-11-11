import type { Session } from "@libras/shared";
import { ApiError } from "../api/client";
import type { ApiClient } from "../api/client";
import type { SessionStore } from "./session-store";

/** Renew a little before the access token runs out, so a request does not fail on the way. */
const RENEW_MARGIN_MS = 30_000;

type SessionApi = Pick<ApiClient, "refreshSession" | "signOut">;

/**
 * Holds the signed-in session and makes authorised calls with it. It is the
 * only code that touches the stored tokens.
 *
 * - `call(fn)` runs `fn` with a working access token. If the server says the
 *   token no longer works (401) it renews the session once and retries once.
 * - A refresh token works only once, so concurrent calls share one renewal.
 * - When the session cannot be renewed (the server refuses the refresh token)
 *   it is cleared, `onEnded` fires and the call fails with 401 `not_signed_in`.
 *   A failure to reach the server leaves the session alone: being offline is
 *   not being signed out.
 */
export class SessionManager {
  readonly #store: SessionStore;
  readonly #api: SessionApi;
  readonly #now: () => number;
  readonly #onEnded: () => void;
  #session: Session | undefined;
  #renewal: Promise<Session> | undefined;

  constructor(options: { store: SessionStore; api: SessionApi; onEnded: () => void; now?: () => number }) {
    this.#store = options.store;
    this.#api = options.api;
    this.#onEnded = options.onEnded;
    this.#now = options.now ?? Date.now;
  }

  /** Loads the stored session at launch. Returns whether there is one. */
  async restore(): Promise<boolean> {
    this.#session = await this.#store.read();
    return this.#session !== undefined;
  }

  /** Starts a session: a sign-in just succeeded. */
  async begin(session: Session): Promise<void> {
    this.#session = session;
    await this.#store.write(session);
  }

  /** Signs out: tells the server (best effort) and forgets the session on this device. */
  async end(): Promise<void> {
    const session = this.#session;
    this.#session = undefined;
    this.#renewal = undefined;
    await this.#store.clear();
    if (session === undefined) return;
    try {
      await this.#api.signOut(session.accessToken);
    } catch {
      // The device is signed out either way; the server session expires by itself.
    }
  }

  async call<T>(fn: (accessToken: string) => Promise<T>): Promise<T> {
    let session = this.#session;
    if (session === undefined) throw notSignedIn();
    if (Date.parse(session.expiresAt) - this.#now() < RENEW_MARGIN_MS) session = await this.#renew(session);

    try {
      return await fn(session.accessToken);
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) throw error;
      const renewed = await this.#renew(session);
      return fn(renewed.accessToken);
    }
  }

  /** Swaps the refresh token for a new session, once for all callers that found the old one dead. */
  async #renew(stale: Session): Promise<Session> {
    // Signed out meanwhile, or someone else already renewed while this caller was waiting.
    if (this.#session === undefined) throw notSignedIn();
    if (this.#session !== stale) return this.#session;
    if (this.#renewal === undefined) {
      this.#renewal = this.#renewOnce(stale).finally(() => {
        this.#renewal = undefined;
      });
    }
    return this.#renewal;
  }

  async #renewOnce(stale: Session): Promise<Session> {
    try {
      const { session } = await this.#api.refreshSession(stale.refreshToken);
      // A sign-out while the renewal was in flight wins.
      if (this.#session !== stale) throw notSignedIn();
      await this.begin(session);
      return session;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401 && this.#session === stale) {
        this.#session = undefined;
        await this.#store.clear();
        this.#onEnded();
        throw notSignedIn();
      }
      throw error;
    }
  }
}

function notSignedIn(): ApiError {
  return new ApiError(401, "not_signed_in", "Please sign in to continue.");
}
