export interface Match {
  word: string;
  dist: number;
}

/** A fuzzy-search index over a fixed lexicon. All implementations use plain Levenshtein distance. */
export interface SearchIndex {
  readonly name: string;
  readonly description: string;
  build(words: readonly string[]): void;
  /** Return every lexicon word within Levenshtein distance <= k of the query, in any order. */
  search(query: string, k: number): Match[];
}

export function sortMatches(m: Match[]): Match[] {
  return m.sort((a, b) => a.dist - b.dist || (a.word < b.word ? -1 : a.word > b.word ? 1 : 0));
}
