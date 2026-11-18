import { useCallback, useEffect, useRef, useState } from "react";
import { addRecentSearch, removeRecentSearch } from "@libras/shared";
import { clearRecentSearches, loadRecentSearches, saveRecentSearches } from "./recent-searches-store";

/** The signed-in Member's recent searches (newest first, at most 10), loaded from the phone when `active` turns on. */
export function useRecentSearches(memberId: string, active: boolean) {
  const [searches, setSearches] = useState<string[]>([]);
  const current = useRef<string[]>([]);

  const set = useCallback(
    (next: string[]) => {
      current.current = next;
      setSearches(next);
      void (next.length === 0 ? clearRecentSearches() : saveRecentSearches(memberId, next));
    },
    [memberId],
  );

  useEffect(() => {
    if (!active) return;
    let stale = false;
    void loadRecentSearches(memberId).then((loaded) => {
      if (stale) return;
      current.current = loaded;
      setSearches(loaded);
    });
    return () => {
      stale = true;
    };
  }, [memberId, active]);

  return {
    searches,
    /** Records a submitted search at the top. */
    add: (query: string) => set(addRecentSearch(current.current, query)),
    remove: (query: string) => set(removeRecentSearch(current.current, query)),
    clear: () => set([]),
  };
}
