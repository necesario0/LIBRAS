import { useEffect, useRef, useState } from "react";
import type { CatalogSuggestion } from "@libras/shared";
import { CATALOG_SUGGEST_MIN_LENGTH } from "@libras/shared";
import { api } from "../api";
import type { AuthorizedRequest } from "../auth/authorized-request";

/** How long typing must pause before suggestions are fetched. */
export const SUGGEST_PAUSE_MS = 250;

/**
 * Title and author suggestions for what is being typed: from 2 characters, after
 * a short pause. A reply that arrives after a newer query started is dropped. A
 * failure shows no suggestions: they are a help, and Search still works.
 */
export function useSuggestions(request: AuthorizedRequest, query: string, enabled: boolean): CatalogSuggestion[] {
  const [suggestions, setSuggestions] = useState<CatalogSuggestion[]>([]);
  const requestRef = useRef(request);
  requestRef.current = request;

  useEffect(() => {
    const text = query.trim();
    if (!enabled || text.length < CATALOG_SUGGEST_MIN_LENGTH) {
      setSuggestions([]);
      return;
    }
    let stale = false;
    const timer = setTimeout(() => {
      requestRef
        .current((token) => api.suggestCatalog(token, text))
        .then((response) => {
          if (!stale) setSuggestions(response.suggestions);
        })
        .catch(() => {
          if (!stale) setSuggestions([]);
        });
    }, SUGGEST_PAUSE_MS);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [query, enabled]);

  return suggestions;
}
