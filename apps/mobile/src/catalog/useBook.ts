import { useCallback, useEffect, useRef, useState } from "react";
import type { BookDetail } from "@libras/shared";
import { api } from "../api";
import { ApiError } from "../api/client";
import type { AuthorizedRequest } from "./useCatalogSearch";

/**
 * What the Book page shows:
 * - `loading`: the Book is being fetched;
 * - `loaded`: the Book and its Copy counts;
 * - `missing`: there is no such Book (removed, or a stale link). Not a failure to retry;
 * - `error`: it could not be fetched. `message` is safe to show.
 */
export type BookState =
  | { status: "loading" }
  | { status: "loaded"; book: BookDetail }
  | { status: "missing"; message: string }
  | { status: "error"; message: string };

/** Fetches one Book with its availability, and again on `retry`. */
export function useBook(request: AuthorizedRequest, id: string) {
  const [state, setState] = useState<BookState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const requestRef = useRef(request);
  requestRef.current = request;

  useEffect(() => {
    let current = true;
    setState({ status: "loading" });
    requestRef.current((token) => api.getBook(token, id)).then(
      ({ book }) => {
        if (current) setState({ status: "loaded", book });
      },
      (error: unknown) => {
        if (!current) return;
        const message = error instanceof ApiError ? error.message : "This Book is not available right now. Please try again.";
        const missing = error instanceof ApiError && (error.code === "book_not_found" || error.code === "invalid_request");
        setState(missing ? { status: "missing", message } : { status: "error", message });
      },
    );
    return () => {
      current = false;
    };
  }, [id, attempt]);

  return { state, retry: useCallback(() => setAttempt((n) => n + 1), []) };
}
