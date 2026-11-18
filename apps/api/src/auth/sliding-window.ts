import { AppError } from "../errors.ts";

/** Prune the whole log when it holds more than this many keys. */
const PRUNE_THRESHOLD = 10_000;

/**
 * The times of recent events per key (a client address, an email), forgetting
 * each one once it is older than the window. In memory: the API runs as one
 * process, and a restart forgetting the events only gives a fresh start once.
 * The rate limiters are built on it.
 */
export class SlidingWindowLog {
  readonly #windowMs: number;
  readonly #times = new Map<string, number[]>();

  constructor(windowMinutes: number) {
    this.#windowMs = windowMinutes * 60_000;
  }

  /** The event times of a key that are still inside the window, oldest first. */
  recent(key: string, now: number): number[] {
    const times = this.#times.get(key);
    if (times === undefined) return [];
    const recent = times.filter((time) => time > now - this.#windowMs);
    if (recent.length === 0) this.#times.delete(key);
    else if (recent.length !== times.length) this.#times.set(key, recent);
    return recent;
  }

  record(key: string, now: number): void {
    this.#times.set(key, [...this.recent(key, now), now]);
    if (this.#times.size > PRUNE_THRESHOLD) {
      for (const other of [...this.#times.keys()]) this.recent(other, now);
    }
  }

  /** Takes back one event recorded at `at`. */
  release(key: string, at: number): void {
    const times = this.#times.get(key);
    if (times === undefined) return;
    const index = times.lastIndexOf(at);
    if (index === -1) return;
    const rest = times.filter((_, i) => i !== index);
    if (rest.length === 0) this.#times.delete(key);
    else this.#times.set(key, rest);
  }

  /**
   * The 429 for a key that reached its limit: `too_many_attempts`, with a
   * Retry-After header for when the oldest event leaves the window.
   */
  refusal(key: string, now: number, what: string): AppError {
    const oldest = this.recent(key, now)[0] ?? now;
    return tooManyAttempts({ what, retryAfterMs: oldest + this.#windowMs - now });
  }
}

/**
 * The 429 `too_many_attempts` of every rate limit, with a Retry-After header in
 * whole seconds (at least 1). `message` replaces the usual "Too many <what>.
 * Please wait N minute(s) and try again."
 */
export function tooManyAttempts(refusal: { what: string; retryAfterMs: number; message?: string }): AppError {
  const retryAfterSeconds = Math.max(1, Math.ceil(refusal.retryAfterMs / 1000));
  return new AppError(
    429,
    "too_many_attempts",
    refusal.message ?? `Too many ${refusal.what}. Please wait ${Math.ceil(retryAfterSeconds / 60)} minute(s) and try again.`,
    { headers: { "Retry-After": String(retryAfterSeconds) } },
  );
}
