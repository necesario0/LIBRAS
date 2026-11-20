import { useCallback, useRef, useState } from "react";
import { SAVED_BOOK_MESSAGES } from "@libras/shared";
import { api } from "../api";
import type { AuthorizedRequest } from "../auth/authorized-request";

/**
 * The Save button of the Book page. It shows the change at once and puts it
 * back, with a message, when the API does not take it. A press while the last
 * one is still being sent is ignored, so the button never ends up out of step
 * with the server.
 */
export function useSaveToggle(request: AuthorizedRequest, bookId: string, initiallySaved: boolean) {
  const [saved, setSaved] = useState(initiallySaved);
  const [failure, setFailure] = useState<string | undefined>(undefined);
  const busy = useRef(false);
  const requestRef = useRef(request);
  requestRef.current = request;

  const toggle = useCallback(async (): Promise<boolean | undefined> => {
    if (busy.current) return undefined;
    busy.current = true;
    const next = !saved;
    setSaved(next);
    setFailure(undefined);
    try {
      await requestRef.current((token) => (next ? api.saveBook(token, bookId) : api.unsaveBook(token, bookId)));
      return next;
    } catch {
      setSaved(!next);
      setFailure(next ? SAVED_BOOK_MESSAGES.saveFailed : SAVED_BOOK_MESSAGES.removeFailed);
      return undefined;
    } finally {
      busy.current = false;
    }
  }, [saved, bookId]);

  return { saved, failure, toggle };
}
