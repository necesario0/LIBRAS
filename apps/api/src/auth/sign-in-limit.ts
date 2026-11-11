import type { Clock } from "../clock.ts";
import { AppError } from "../errors.ts";

export interface SignInLimitOptions {
  /** Refused sign-ins one client address may make within the window before it is blocked. */
  maxFailures: number;
  /** How long a failure counts against the address. */
  windowMinutes: number;
}

/** Five failures in fifteen minutes. A real person rarely gets there; a password guesser always does. */
export const DEFAULT_SIGN_IN_LIMIT: SignInLimitOptions = { maxFailures: 5, windowMinutes: 15 };

/** Prune the whole table when it grows past this many addresses. */
const PRUNE_THRESHOLD = 10_000;

/**
 * Blocks a client address after repeated failed sign-ins (spec #2, "Security
 * controls"). It keeps the time of each recent failure per address, in memory:
 * the API runs as one process, and a restart forgetting the failures only
 * gives a guesser a fresh start once. Time comes from the injected clock, so a
 * test proves the block and its end without waiting.
 *
 * Only refusals count (wrong credentials, an unverified account, the wrong
 * kind of account). A success does not clear the failures, so someone with an
 * account of their own cannot reset the count between guesses at another one.
 * While an address is blocked it is refused before the password is looked at,
 * so the block cannot be used to find out whether a guess was right.
 */
export class SignInLimiter {
  readonly #clock: Clock;
  readonly #options: SignInLimitOptions;
  readonly #failures = new Map<string, number[]>();

  constructor(clock: Clock, options: SignInLimitOptions = DEFAULT_SIGN_IN_LIMIT) {
    this.#clock = clock;
    this.#options = options;
  }

  /**
   * Runs one sign-in attempt for a client address. Refuses it with 429
   * `too_many_attempts` (and a Retry-After header) when the address is
   * blocked. Otherwise runs `attempt`; if that ends in a refusal (401 or 403)
   * the failure is counted. Other errors, such as the service being down, are not.
   */
  async attempt<T>(address: string | undefined, attempt: () => Promise<T>): Promise<T> {
    const key = address ?? "unknown";
    const now = this.#clock.now().getTime();
    const recent = this.#recent(key, now);
    if (recent.length >= this.#options.maxFailures) {
      const oldest = recent[0] ?? now;
      const retryAfterSeconds = Math.max(1, Math.ceil((oldest + this.#windowMs - now) / 1000));
      throw new AppError(
        429,
        "too_many_attempts",
        `Too many failed sign-ins. Please wait ${Math.ceil(retryAfterSeconds / 60)} minute(s) and try again.`,
        { headers: { "Retry-After": String(retryAfterSeconds) } },
      );
    }
    try {
      return await attempt();
    } catch (error) {
      if (error instanceof AppError && (error.status === 401 || error.status === 403)) this.#record(key, now);
      throw error;
    }
  }

  get #windowMs(): number {
    return this.#options.windowMinutes * 60_000;
  }

  /** The failure times of an address that are still inside the window, oldest first. */
  #recent(key: string, now: number): number[] {
    const times = this.#failures.get(key);
    if (times === undefined) return [];
    const recent = times.filter((time) => time > now - this.#windowMs);
    if (recent.length === 0) this.#failures.delete(key);
    else if (recent.length !== times.length) this.#failures.set(key, recent);
    return recent;
  }

  #record(key: string, now: number): void {
    this.#failures.set(key, [...this.#recent(key, now), now]);
    if (this.#failures.size > PRUNE_THRESHOLD) {
      for (const other of [...this.#failures.keys()]) this.#recent(other, now);
    }
  }
}
