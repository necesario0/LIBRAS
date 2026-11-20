import { useCallback, useRef, useState } from "react";
import type { CatalogSearchFilters, CatalogSearchResponse } from "@libras/shared";
import { CATALOG_SEARCH_MAX_QUERY_LENGTH, DEFAULT_CATALOG_SEARCH_FILTERS } from "@libras/shared";
import { api } from "../api";
import { ApiError } from "../api/client";
import type { AuthorizedRequest } from "../auth/authorized-request";

/**
 * What the results area shows:
 * - `idle`: nothing has been submitted (recent searches or suggestions show instead);
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

/**
 * The catalog search of Home's search mode. Typing only edits `query` (and takes
 * the results away, so suggestions show again); `submit` runs the search. An
 * answer that arrives after a newer search started, or after the search was
 * cleared, is dropped.
 *
 * `filters` (sort, Available now, Latest edition only) go with every search and
 * stay set for the next one. Changing them runs the shown search again.
 */
export function useCatalogSearch(request: AuthorizedRequest) {
  const [query, setQueryText] = useState("");
  const [state, setState] = useState<CatalogSearchState>({ status: "idle" });
  const [filters, setFiltersState] = useState<CatalogSearchFilters>(DEFAULT_CATALOG_SEARCH_FILTERS);
  const filtersRef = useRef(filters);
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
      const response = await requestRef.current((token) => api.searchCatalog(token, trimmed, filtersRef.current));
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

  const setQuery = useCallback((text: string) => {
    setQueryText(text);
    // Editing the text ends the search that was shown: suggestions take its place.
    latest.current++;
    shown.current = undefined;
    setState({ status: "idle" });
  }, []);

  const submittedState = state.status !== "idle";
  const setFilters = (change: Partial<CatalogSearchFilters>) => {
    const next = { ...filtersRef.current, ...change };
    filtersRef.current = next;
    setFiltersState(next);
    if (submittedState) void run(query);
  };

  return {
    query,
    setQuery,
    state,
    /** Whether a search has been submitted for the text in the bar (loading, results, no results or failure). */
    submitted: submittedState,
    filters,
    /** Changes some filters and, when a search is shown, runs it again with them. */
    setFilters,
    /** Searches `text` (default: the text in the bar) now: the search key, a recent search or an author suggestion. */
    submit: (text: string = query) => {
      setQueryText(text);
      void run(text);
    },
    /** Runs the last search again (the "Try again" button). */
    retry: () => void run(query),
    /** Empties the bar and drops any results (Cancel). */
    reset: () => setQuery(""),
  };
}
