import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { DIGITAL_ID_WINDOW_SECONDS, msUntilRefresh } from "@libras/shared";
import type { DigitalIdResponse } from "@libras/shared";
import { api } from "../api";
import { useAuth } from "../auth/AuthContext";

export type DigitalIdState =
  | { status: "loading" }
  | { status: "ready"; id: DigitalIdResponse; receivedAt: number }
  | { status: "error"; message: string };

/** Asking a little after the window turns makes sure the API is already in the new window. */
const REFRESH_MARGIN_MS = 250;
/** After a failed refresh, the shown code still works for one more window: try again soon. */
const RETRY_MS = 5_000;
const WINDOW_MS = DIGITAL_ID_WINDOW_SECONDS * 1000;

/** The phone's steady clock: unaffected by the user or the network changing the wall clock. */
const steadyNow = () => performance.now();

/**
 * The Member's current Digital ID, replaced by itself when the API's 60-second
 * window turns. The refresh is timed from the API's clock (see `msUntilRefresh`),
 * and the code is fetched again when the app comes back to the foreground,
 * because timers do not run while it is in the background.
 */
export function useDigitalId(): { state: DigitalIdState; retry: () => void } {
  const { request } = useAuth();
  // The context hands out a new `request` when the sign-in state changes; the timer must not restart for that.
  const requestRef = useRef(request);
  useEffect(() => {
    requestRef.current = request;
  });
  const [state, setState] = useState<DigitalIdState>({ status: "loading" });
  const current = useRef<DigitalIdState>(state);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const generation = useRef(0);

  const show = useCallback((next: DigitalIdState) => {
    current.current = next;
    setState(next);
  }, []);

  const load = useCallback(() => {
    clearTimeout(timer.current);
    const mine = ++generation.current;
    requestRef.current((accessToken) => api.getDigitalId(accessToken)).then(
      (id) => {
        if (mine !== generation.current) return;
        show({ status: "ready", id, receivedAt: steadyNow() });
        timer.current = setTimeout(load, msUntilRefresh(id, 0) + REFRESH_MARGIN_MS);
      },
      (error: unknown) => {
        if (mine !== generation.current) return;
        const shown = current.current;
        // The desk accepts the shown code until one window after its refresh time: keep it and retry.
        if (shown.status === "ready" && msUntilRefresh(shown.id, steadyNow() - shown.receivedAt) + WINDOW_MS > RETRY_MS) {
          timer.current = setTimeout(load, RETRY_MS);
          return;
        }
        show({
          status: "error",
          message: error instanceof Error ? error.message : "Your Digital ID could not be loaded. Please try again.",
        });
      },
    );
  }, [show]);

  useEffect(() => {
    load();
    const subscription = AppState.addEventListener("change", (appState) => {
      if (appState === "active") load();
    });
    return () => {
      generation.current += 1;
      clearTimeout(timer.current);
      subscription.remove();
    };
  }, [load]);

  const retry = useCallback(() => {
    show({ status: "loading" });
    load();
  }, [load, show]);

  return { state, retry };
}

/** Whole seconds left on the shown code, ticking once a second while it is shown. */
export function useSecondsLeft(state: DigitalIdState): number | undefined {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (state.status !== "ready") return;
    const interval = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(interval);
  }, [state]);
  if (state.status !== "ready") return undefined;
  return Math.ceil(msUntilRefresh(state.id, steadyNow() - state.receivedAt) / 1000);
}
