import type { AppDeps } from "../app.ts";
import { expireDueHolds } from "./expiry.ts";

export interface PickupSweeper {
  /** Stops the timer. A sweep that is running finishes. */
  stop(): void;
}

/** How often the API sweeps while it is running. The database's schedule covers the time it is not. */
export const PICKUP_SWEEP_INTERVAL_MS = 60_000;

/**
 * Runs the Pickup Window expiry sweep (`expireDueHolds`) every `intervalMs`
 * for as long as this process lives, whether or not anyone is using the API.
 * A sweep that fails is logged and the next one runs on time, and a sweep never
 * starts while the last is still running. The timer does not keep the process
 * alive.
 *
 * This alone is not enough on a host that stops an idle service: see ADR 0007,
 * which adds a schedule in the database that calls the API.
 */
export function startPickupSweeper(deps: AppDeps, intervalMs = PICKUP_SWEEP_INTERVAL_MS): PickupSweeper {
  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    expireDueHolds(deps)
      .catch((error: unknown) => deps.logger.error("The Pickup Window sweep failed", error))
      .finally(() => {
        running = false;
      });
  }, intervalMs);
  timer.unref();
  return { stop: () => clearInterval(timer) };
}
