import { boundedLevenshtein } from "./levenshtein.ts";
import type { Match, SearchIndex } from "./types.ts";

/**
 * Bigram inverted index with the classic count filter, then exact verification.
 * This is the in-memory analogue of PostgreSQL pg_trgm: words sharing too few
 * q-grams with the query cannot be within edit distance k.
 *
 * Filter (Gravano et al.): with q-grams padded by q-1 sentinels on each end, two
 * strings within distance k share at least max(|s|,|t|) + q - 1 - k*q grams
 * (as multisets). When that bound is <= 0 the filter cannot prune, so we fall
 * back to scanning words of compatible length.
 */
export class NgramIndex implements SearchIndex {
  readonly name = "ngram-bigram";
  readonly description = "Bigram inverted index + count filter + verify (pg_trgm analogue)";
  words: readonly string[] = [];
  postings = new Map<string, number[]>();
  byLength = new Map<number, number[]>();
  counts = new Uint16Array(0);
  q = 2;

  static grams(word: string, q: number): string[] {
    const padded = "^".repeat(q - 1) + word + "$".repeat(q - 1);
    const seen = new Map<string, number>();
    const out: string[] = [];
    for (let i = 0; i + q <= padded.length; i++) {
      const g = padded.slice(i, i + q);
      const n = (seen.get(g) ?? 0) + 1;
      seen.set(g, n);
      out.push(n === 1 ? g : `${g}#${n}`); // tag repeats so multiset overlap counts correctly
    }
    return out;
  }

  build(words: readonly string[]): void {
    this.words = words;
    this.postings = new Map();
    this.byLength = new Map();
    this.counts = new Uint16Array(words.length);
    for (let id = 0; id < words.length; id++) {
      const w = words[id]!;
      for (const g of NgramIndex.grams(w, this.q)) {
        const list = this.postings.get(g);
        if (list) list.push(id); else this.postings.set(g, [id]);
      }
      const bl = this.byLength.get(w.length);
      if (bl) bl.push(id); else this.byLength.set(w.length, [id]);
    }
  }

  search(query: string, k: number): Match[] {
    const out: Match[] = [];
    const q = this.q;
    const qGrams = NgramIndex.grams(query, q);
    const counts = this.counts;
    const touched: number[] = [];
    for (const g of qGrams) {
      const list = this.postings.get(g);
      if (!list) continue;
      for (const id of list) {
        if (counts[id] === 0) touched.push(id);
        counts[id]!++;
      }
    }
    const m = query.length;
    try {
      // The required overlap is max(|w|, m) + q - 1 - k*q, smallest when |w| <= m.
      // If even that smallest bound is <= 0, words sharing zero grams could still match,
      // so the filter is unusable for this query.
      const weakest = m + q - 1 - k * q;
      if (weakest <= 0) {
        // Filter cannot prune safely: verify every word of compatible length.
        for (let len = Math.max(1, m - k); len <= m + k; len++) {
          const ids = this.byLength.get(len);
          if (!ids) continue;
          for (const id of ids) {
            const d = boundedLevenshtein(query, this.words[id]!, k);
            if (d <= k) out.push({ word: this.words[id]!, dist: d });
          }
        }
        return out;
      }
      for (const id of touched) {
        const w = this.words[id]!;
        if (Math.abs(w.length - m) > k) continue;
        const need = Math.max(w.length, m) + q - 1 - k * q;
        if (counts[id]! < need) continue;
        const d = boundedLevenshtein(query, w, k);
        if (d <= k) out.push({ word: w, dist: d });
      }
      return out;
    } finally {
      for (const id of touched) counts[id] = 0;
    }
  }
}
