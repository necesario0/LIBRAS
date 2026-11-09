import { boundedLevenshtein } from "./levenshtein.ts";
import type { Match, SearchIndex } from "./types.ts";

/**
 * SymSpell-style symmetric delete index. Precomputes every string reachable from each
 * lexicon word by deleting up to `maxK` characters; a query is matched by generating
 * its own deletions and looking them up. Candidates are verified with the exact
 * bounded Levenshtein, so results match the other indexes. Trades memory and build
 * time for very fast lookups.
 */
export class SymSpellIndex implements SearchIndex {
  readonly name = "symspell";
  readonly description = "Symmetric-delete index (precomputed deletions, k <= 2)";
  maxK: number;
  words: readonly string[] = [];
  deletes = new Map<string, number[]>();

  constructor(maxK = 2) {
    this.maxK = maxK;
  }

  static deletions(word: string, maxK: number, into: Set<string>): void {
    into.add(word);
    let frontier = [word];
    for (let depth = 0; depth < maxK; depth++) {
      const next: string[] = [];
      for (const w of frontier) {
        if (w.length <= 1) continue;
        for (let i = 0; i < w.length; i++) {
          const d = w.slice(0, i) + w.slice(i + 1);
          if (!into.has(d)) { into.add(d); next.push(d); }
        }
      }
      frontier = next;
    }
  }

  build(words: readonly string[]): void {
    this.words = words;
    this.deletes = new Map();
    for (let id = 0; id < words.length; id++) {
      const set = new Set<string>();
      SymSpellIndex.deletions(words[id]!, this.maxK, set);
      for (const d of set) {
        const list = this.deletes.get(d);
        if (list) list.push(id); else this.deletes.set(d, [id]);
      }
    }
  }

  search(query: string, k: number): Match[] {
    const kk = Math.min(k, this.maxK);
    const variants = new Set<string>();
    SymSpellIndex.deletions(query, kk, variants);
    const seen = new Set<number>();
    const out: Match[] = [];
    for (const v of variants) {
      const ids = this.deletes.get(v);
      if (!ids) continue;
      for (const id of ids) {
        if (seen.has(id)) continue;
        seen.add(id);
        const w = this.words[id]!;
        const d = boundedLevenshtein(query, w, kk);
        if (d <= kk) out.push({ word: w, dist: d });
      }
    }
    return out;
  }
}
