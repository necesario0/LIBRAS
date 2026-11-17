import type { Clock } from "../clock.ts";
import { SlidingWindowLog } from "./sliding-window.ts";

export interface RequestLimitOptions {
  /** Requests one key may make within the window. The next one is refused. */
  maxRequests: number;
  windowMinutes: number;
}

/**
 * Limits how often something may be asked for, whatever the answer: every
 * request counts, unlike `AttemptLimiter`, which counts only refusals. For
 * requests that cost something on every call, such as an emailed code.
 * In memory, on the injected clock, like `AttemptLimiter`.
 */
export class RequestLimiter {
  readonly #clock: Clock;
  readonly #options: RequestLimitOptions;
  /** What is being counted, for the message a refused client reads ("code requests"). */
  readonly #what: string;
  readonly #requests: SlidingWindowLog;

  constructor(clock: Clock, options: RequestLimitOptions, what: string) {
    this.#clock = clock;
    this.#options = options;
    this.#what = what;
    this.#requests = new SlidingWindowLog(options.windowMinutes);
  }

  /**
   * Counts one request for `key`. Throws 429 `too_many_attempts` (with
   * Retry-After) instead when the key has used up its requests in the window.
   * A refused request is not counted, so the wait ends when the window says.
   */
  admit(key: string): void {
    const now = this.#clock.now().getTime();
    if (this.#requests.recent(key, now).length >= this.#options.maxRequests) {
      throw this.#requests.refusal(key, now, this.#what);
    }
    this.#requests.record(key, now);
  }
}
