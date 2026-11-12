import { useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { isActiveHold } from "@libras/shared";
import type { Hold } from "@libras/shared";
import { api } from "../api";
import { ApiError } from "../api/client";
import type { AuthorizedRequest } from "../catalog/useCatalogSearch";

/**
 * What a screen shows of the Member's Holds:
 * - `loading`: first fetch;
 * - `loaded`: the Holds, active ones first (the API's order);
 * - `error`: they could not be fetched. `message` is safe to show.
 */
export type HoldsState = { status: "loading" } | { status: "loaded"; holds: Hold[] } | { status: "error"; message: string };

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
  const [state, setState] = useState<HoldsState>({ status: "loading" });
  const requestRef = useRef(request);
  requestRef.current = request;
  const latest = useRef(0);

  const reload = useCallback(async () => {
    const id = ++latest.current;
    try {
      const { holds } = await requestRef.current((token) => api.getHolds(token));
      if (id === latest.current) setState({ status: "loaded", holds });
    } catch (error) {
      if (id !== latest.current) return;
      const message = holdFailureMessage(error, "Your Holds could not be loaded. Please try again.");
      setState((current) => (current.status === "loaded" ? current : { status: "error", message }));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  return { state, reload };
}

/** Places a Hold on a Book. Resolves with the Hold; rejects with an `ApiError` carrying the refusal. */
export function placeHold(request: AuthorizedRequest, bookId: string): Promise<Hold> {
  return request((token) => api.placeHold(token, bookId)).then(({ hold }) => hold);
}

/** Cancels a Hold. Resolves with the cancelled Hold; rejects with an `ApiError`. */
export function cancelHold(request: AuthorizedRequest, holdId: string): Promise<Hold> {
  return request((token) => api.cancelHold(token, holdId)).then(({ hold }) => hold);
}
