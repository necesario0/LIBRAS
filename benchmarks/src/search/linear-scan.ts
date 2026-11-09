import { boundedLevenshtein } from "./levenshtein.ts";
import type { Match, SearchIndex } from "./types.ts";

/**
 * Baseline: scan every word with a banded/cutoff DP. This is a *stronger* baseline
 * than the SQL ILIKE scan in the milestone, because it already skips on length
 * difference and aborts rows early. It is the in-memory analogue of
 * "no index at all".
 */
export class LinearScanIndex implements SearchIndex {
  readonly name = "linear-scan";
  readonly description = "Scan every word with cutoff DP (no index)";
  words: readonly string[] = [];

  build(words: readonly string[]): void {
    this.words = words;
  }

  search(query: string, k: number): Match[] {
    const out: Match[] = [];
    for (const w of this.words) {
      const d = boundedLevenshtein(query, w, k);
      if (d <= k) out.push({ word: w, dist: d });
    }
    return out;
  }
}
