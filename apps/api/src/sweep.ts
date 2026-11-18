import type { AppDeps } from "./app.ts";
import { expireDueHolds } from "./holds/expiry.ts";
import { sendLoanNotices } from "./notices/index.ts";

/** What one tick of the sweep did: Holds whose Pickup Window it ended, Loan notice emails it sent. */
export interface SweepResult {
  expired: number;
  noticeEmails: number;
}

/**
 * One tick of the sweep: the work that must happen on time whether or not
 * anyone uses the API. It runs each job in turn: Pickup Window expiry (ADR
 * 0007), then Loan notices (ADR 0009). A job that fails is logged and counts
 * as having done nothing; the other still runs.
 */
export async function runSweep(deps: AppDeps): Promise<SweepResult> {
  const job = async (name: string, work: () => Promise<number>): Promise<number> => {
    try {
      return await work();
    } catch (error) {
      deps.logger.error(`The sweep job "${name}" failed`, error);
      return 0;
    }
  };
  const expired = await job("Pickup Window expiry", () => expireDueHolds(deps));
  const noticeEmails = await job("Loan notices", () => sendLoanNotices(deps));
  return { expired, noticeEmails };
}

export interface Sweeper {
  /** Stops the timer. A sweep that is running finishes. */
  stop(): void;
}

/** How often the API sweeps while it is running. The database's schedule covers the time it is not. */
export const SWEEP_INTERVAL_MS = 60_000;

/**
 * Runs the sweep (`runSweep`) every `intervalMs` for as long as this process
 * lives, whether or not anyone is using the API. A sweep that fails is logged
 * and the next one runs on time, and a sweep never starts while the last is
 * still running. The timer does not keep the process alive.
 *
 * This alone is not enough on a host that stops an idle service: see ADR 0007,
 * which adds a schedule in the database that calls the API.
 */
export function startSweeper(deps: AppDeps, intervalMs = SWEEP_INTERVAL_MS): Sweeper {
  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    runSweep(deps)
      .catch((error: unknown) => deps.logger.error("The sweep failed", error))
      .finally(() => {
        running = false;
      });
  }, intervalMs);
  timer.unref();
  return { stop: () => clearInterval(timer) };
}
