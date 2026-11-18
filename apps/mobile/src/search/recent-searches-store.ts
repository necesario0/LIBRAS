import * as SecureStore from "expo-secure-store";
import { RECENT_SEARCHES_LIMIT } from "@libras/shared";

/**
 * The Member's recent searches, kept only on this phone (never sent to the API).
 * They belong to one Member: another Member signing in finds none, and signing
 * out wipes them.
 */
const KEY = "libras.recent-searches";

interface Stored {
  memberId: string;
  searches: string[];
}

function isStored(value: unknown): value is Stored {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.memberId === "string" && Array.isArray(candidate.searches) && candidate.searches.every((s) => typeof s === "string");
}

/** The recent searches of this Member, newest first. Another Member's are wiped, and an unreadable value counts as none. */
export async function loadRecentSearches(memberId: string): Promise<string[]> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (isStored(parsed) && parsed.memberId === memberId) return parsed.searches.slice(0, RECENT_SEARCHES_LIMIT);
    await SecureStore.deleteItemAsync(KEY);
  } catch {
    // Unreadable: start again with none.
  }
  return [];
}

export async function saveRecentSearches(memberId: string, searches: readonly string[]): Promise<void> {
  const stored: Stored = { memberId, searches: [...searches] };
  try {
    await SecureStore.setItemAsync(KEY, JSON.stringify(stored));
  } catch {
    // The history is a convenience: failing to keep it must never break a search.
  }
}

/** Forgets every recent search. Sign-out and "Clear search history" call this. */
export async function clearRecentSearches(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(KEY);
  } catch {
    // Nothing to clear, or storage is unavailable.
  }
}
