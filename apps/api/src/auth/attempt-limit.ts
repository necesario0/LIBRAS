import type { Clock } from "../clock.ts";
import { AppError } from "../errors.ts";

export interface AttemptLimitOptions {
  /** Refused attempts one client address may make within the window before it is blocked. */
  maxFailures: number;
  /** How long a failure counts against the address. */
  windowMinutes: number;
}

/** Five failures in fifteen minutes. A real person rarely gets there; a password guesser always does. */
export const DEFAULT_SIGN_IN_LIMIT: AttemptLimitOptions = { maxFailures: 5, windowMinutes: 15 };

/** Prune the whole table when it grows past this many addresses. */
const PRUNE_THRESHOLD = 10_000;

/**
 * Blocks a client address after repeated refused attempts at something that
 * must not be guessed: sign-ins (spec #2, "Security controls") and pairing
 * codes of the phone scanner. It keeps the time of each recent failure per
 * address, in memory: the API runs as one process, and a restart forgetting
 * the failures only gives a guesser a fresh start once. Time comes from the
 * injected clock, so a test proves the block and its end without waiting.
 *
 * Only refusals count (wrong credentials, an unverified account, the wrong
 * kind of account, a wrong code). A success does not clear the failures, so
 * someone with an account of their own cannot reset the count between guesses
 * at another one. While an address is blocked it is refused before the attempt
 * runs, so the block cannot be used to find out whether a guess was right.
 *
 * Attempts at the same moment cannot slip past the limit together: each one
 * reserves its failure before it starts, so the next one already counts it, and
 * gives it back if the attempt turns out not to be a refusal.
 */
export class AttemptLimiter {
  readonly #clock: Clock;
  readonly #options: AttemptLimitOptions;
  /** What is being counted, for the message a blocked client reads ("failed sign-ins"). */
  readonly #what: string;
  readonly #failures = new Map<string, number[]>();

  constructor(clock: Clock, options: AttemptLimitOptions = DEFAULT_SIGN_IN_LIMIT, what = "failed sign-ins") {
    this.#clock = clock;
    this.#options = options;
    this.#what = what;
  }

  /**
   * Runs one attempt for a client address. Refuses it with 429
   * `too_many_attempts` (and a Retry-After header) when the address is
   * blocked. Otherwise reserves a failure and runs `attempt`; if that ends in a
   * refusal (401 or 403) the failure stays counted. On success, and on other
   * errors such as the service being down, it is given back.
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
        `Too many ${this.#what}. Please wait ${Math.ceil(retryAfterSeconds / 60)} minute(s) and try again.`,
        { headers: { "Retry-After": String(retryAfterSeconds) } },
      );
    }
    // Reserved before anything is awaited: attempts running at the same moment each see the others.
    this.#record(key, now);
    let refused = false;
    try {
      return await attempt();
    } catch (error) {
      refused = error instanceof AppError && (error.status === 401 || error.status === 403);
      throw error;
    } finally {
      if (!refused) this.#release(key, now);
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

  /** Gives back one failure reserved at `at`. */
  #release(key: string, at: number): void {
    const times = this.#failures.get(key);
    if (times === undefined) return;
    const index = times.lastIndexOf(at);
    if (index === -1) return;
    const rest = times.filter((_, i) => i !== index);
    if (rest.length === 0) this.#failures.delete(key);
    else this.#failures.set(key, rest);
  }
}
