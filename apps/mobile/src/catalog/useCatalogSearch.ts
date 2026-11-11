import { useCallback, useEffect, useRef, useState } from "react";
import type { CatalogSearchResponse } from "@libras/shared";
import { CATALOG_SEARCH_MAX_QUERY_LENGTH } from "@libras/shared";
import { api } from "../api";
import { ApiError } from "../api/client";

/**
 * What the search area shows:
 * - `idle`: nothing typed yet;
 * - `loading`: a search is running (the previous results stay visible under it);
 * - `results`: Books matched;
 * - `empty`: the search ran and nothing matched. Not a failure;
 * - `error`: the search could not run. `message` is safe to show.
 */
export type CatalogSearchState =
  | { status: "idle" }
  | { status: "loading"; query: string; previous: CatalogSearchResponse | undefined }
  | { status: "results"; response: CatalogSearchResponse }
  | { status: "empty"; query: string }
  | { status: "error"; query: string; message: string };

/** Runs a call with the Member's access token, renewing the session when needed (`useAuth().request`). */
export type AuthorizedRequest = <T>(call: (accessToken: string) => Promise<T>) => Promise<T>;

/** How long typing must pause before the search runs. */
export const SEARCH_PAUSE_MS = 300;

/**
 * Search as you type. Typing runs a search after a short pause; `submit` runs
 * it at once. An answer that arrives after a newer search started is dropped,
 * so a slow reply never replaces a fresher one.
 */
export function useCatalogSearch(request: AuthorizedRequest) {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<CatalogSearchState>({ status: "idle" });
  const latest = useRef(0);
  const requestRef = useRef(request);
  requestRef.current = request;
  const shown = useRef<CatalogSearchResponse | undefined>(undefined);

  const run = useCallback(async (text: string) => {
    const trimmed = text.trim().slice(0, CATALOG_SEARCH_MAX_QUERY_LENGTH);
    const id = ++latest.current;
    if (trimmed === "") {
      shown.current = undefined;
      setState({ status: "idle" });
      return;
    }
    setState({ status: "loading", query: trimmed, previous: shown.current });
    try {
      const response = await requestRef.current((token) => api.searchCatalog(token, trimmed));
      if (id !== latest.current) return;
      shown.current = response.results.length > 0 ? response : undefined;
      setState(response.results.length > 0 ? { status: "results", response } : { status: "empty", query: trimmed });
    } catch (error) {
      if (id !== latest.current) return;
      shown.current = undefined;
      setState({
        status: "error",
        query: trimmed,
        message: error instanceof ApiError ? error.message : "Search is not available right now. Please try again.",
      });
    }
  }, []);

  useEffect(() => {
    if (query.trim() === "") {
      void run("");
      return;
    }
    const timer = setTimeout(() => void run(query), SEARCH_PAUSE_MS);
    return () => clearTimeout(timer);
  }, [query, run]);

  return {
    query,
    setQuery,
    state,
    /** Searches now, without waiting for the pause (the keyboard's search key). */
    submit: () => void run(query),
    /** Runs the last search again (the "Try again" button). */
    retry: () => void run(query),
  };
}
