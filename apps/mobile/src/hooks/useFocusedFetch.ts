import { useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { ApiError } from "../api/client";
import type { AuthorizedRequest } from "../auth/authorized-request";

/**
 * What a screen shows of something the API answers with an object `T`:
 * - `loading`: first fetch;
 * - `loaded`: the answer's fields;
 * - `error`: it could not be fetched. `message` is safe to show.
 */
export type FetchState<T extends object> = { status: "loading" } | ({ status: "loaded" } & T) | { status: "error"; message: string };

/**
 * Fetches with the Member's session whenever the screen comes into focus (so a
 * screen shows what changed while another one was open) and again on `reload`.
 * An answer that arrives after a newer fetch started is dropped, and a failed
 * refresh keeps what is already shown. `failure` is the message for an error
 * that is not the API's own.
 */
export function useFocusedFetch<T extends object>(
  request: AuthorizedRequest,
  fetch: (accessToken: string) => Promise<T>,
  failure: string,
) {
  const [state, setState] = useState<FetchState<T>>({ status: "loading" });
  const requestRef = useRef(request);
  requestRef.current = request;
  const fetchRef = useRef(fetch);
  fetchRef.current = fetch;
  const latest = useRef(0);

  const reload = useCallback(async () => {
    const id = ++latest.current;
    try {
      const body = await requestRef.current((token) => fetchRef.current(token));
      if (id === latest.current) setState({ ...body, status: "loaded" });
    } catch (error) {
      if (id !== latest.current) return;
      const message = error instanceof ApiError ? error.message : failure;
      setState((current) => (current.status === "loaded" ? current : { status: "error", message }));
    }
  }, [failure]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  return { state, reload };
}
