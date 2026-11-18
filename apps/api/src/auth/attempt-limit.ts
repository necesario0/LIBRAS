import type { Clock } from "../clock.ts";
import { AppError } from "../errors.ts";
import { SlidingWindowLog } from "./sliding-window.ts";

export interface AttemptLimitOptions {
  /** Refused attempts one client address may make within the window before it is blocked. */
  maxFailures: number;
  /** How long a failure counts against the address. */
  windowMinutes: number;
}

/** Five failures in fifteen minutes. A real person rarely gets there; a password guesser always does. */
export const DEFAULT_SIGN_IN_LIMIT: AttemptLimitOptions = { maxFailures: 5, windowMinutes: 15 };

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
  readonly #failures: SlidingWindowLog;

  constructor(clock: Clock, options: AttemptLimitOptions = DEFAULT_SIGN_IN_LIMIT, what = "failed sign-ins") {
    this.#clock = clock;
    this.#options = options;
    this.#what = what;
    this.#failures = new SlidingWindowLog(options.windowMinutes);
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
    if (this.#failures.recent(key, now).length >= this.#options.maxFailures) {
      throw this.#failures.refusal(key, now, this.#what);
    }
    // Reserved before anything is awaited: attempts running at the same moment each see the others.
    this.#failures.record(key, now);
    let refused = false;
    try {
      return await attempt();
    } catch (error) {
      refused = error instanceof AppError && (error.status === 401 || error.status === 403);
      throw error;
    } finally {
      if (!refused) this.#failures.release(key, now);
    }
  }
}
