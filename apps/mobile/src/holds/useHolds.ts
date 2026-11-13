import { isActiveHold } from "@libras/shared";
import type { Hold, MyHoldsResponse } from "@libras/shared";
import { api } from "../api";
import { ApiError } from "../api/client";
import type { AuthorizedRequest } from "../auth/authorized-request";
import { useFocusedFetch } from "../hooks/useFocusedFetch";
import type { FetchState } from "../hooks/useFocusedFetch";

/** What a screen shows of the Member's Holds: when loaded, the Holds, active ones first (the API's order). */
export type HoldsState = FetchState<MyHoldsResponse>;

/** The Holds that still hold a place in a queue: waiting or ready. */
export function activeHolds(holds: readonly Hold[]): Hold[] {
  return holds.filter((hold) => isActiveHold(hold.status));
}

/** A refusal or failure as words the Member can read. */
export function holdFailureMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

/**
 * The Member's Holds. They are fetched when the screen comes into focus (so
 * returning to Home after placing or cancelling one shows the change) and again
 * on `reload`. A failed refresh keeps the Holds already shown.
 */
export function useHolds(request: AuthorizedRequest) {
  return useFocusedFetch(request, api.getHolds, "Your Holds could not be loaded. Please try again.");
}

/** Places a Hold on a Book. Resolves with the Hold; rejects with an `ApiError` carrying the refusal. */
export function placeHold(request: AuthorizedRequest, bookId: string): Promise<Hold> {
  return request((token) => api.placeHold(token, bookId)).then(({ hold }) => hold);
}

/** Cancels a Hold. Resolves with the cancelled Hold; rejects with an `ApiError`. */
export function cancelHold(request: AuthorizedRequest, holdId: string): Promise<Hold> {
  return request((token) => api.cancelHold(token, holdId)).then(({ hold }) => hold);
}
