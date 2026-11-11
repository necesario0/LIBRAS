import type { HealthResponse } from "@libras/shared";
import { useCallback, useEffect, useState } from "react";
import { createApiClient } from "../api/client";
import { API_URL } from "../config";

export type HealthState =
  | { status: "loading" }
  | { status: "ok"; health: HealthResponse }
  | { status: "error"; message: string };

const client = createApiClient({ baseUrl: API_URL });

/** Calls `GET /health` on mount and again whenever `retry` is called. */
export function useHealth(): { state: HealthState; retry: () => void } {
  const [state, setState] = useState<HealthState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    client
      .getHealth()
      .then((health) => {
        if (!cancelled) setState({ status: "ok", health });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "Something went wrong. Please try again.";
        setState({ status: "error", message });
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { state, retry };
}
