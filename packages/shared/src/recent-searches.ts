/** How many recent searches the phone keeps. */
export const RECENT_SEARCHES_LIMIT = 10;

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * The recent searches after `query` was submitted: newest first, at most
 * `RECENT_SEARCHES_LIMIT`, and each search once whatever its letter case (the
 * newest spelling wins). A blank query changes nothing.
 */
export function addRecentSearch(recent: readonly string[], query: string): string[] {
  const text = query.trim().replace(/\s+/g, " ");
  if (text === "") return [...recent];
  return [text, ...recent.filter((earlier) => !same(earlier, text))].slice(0, RECENT_SEARCHES_LIMIT);
}

/** The recent searches without `query` (any letter case). */
export function removeRecentSearch(recent: readonly string[], query: string): string[] {
  return recent.filter((earlier) => !same(earlier, query));
}
