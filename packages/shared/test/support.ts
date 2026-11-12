// Test helpers for the search module: a reference Levenshtein distance that
// defines "correct", and a seeded generator so every run uses the same data.

/** Full Levenshtein distance. O(|a|*|b|) time. The ground truth for every search test. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  let cur = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      cur[j] = Math.min((prev[j] ?? 0) + 1, (cur[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[b.length] ?? 0;
}

/** mulberry32: a small seeded PRNG returning numbers in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LETTERS = "abcdefghijklmnopqrstuvwxyz";

/** `size` unique pseudo-words (lowercase letters, or digits and dots when `callnos`). Deterministic per seed. */
export function generateLexicon(kind: "words" | "callnos", size: number, seed: number): string[] {
  const rng = mulberry32(seed);
  const alphabet = kind === "words" ? LETTERS : "0123456789.abcdefgh";
  const out = new Set<string>();
  while (out.size < size) {
    const length = 3 + Math.floor(rng() * 9);
    let word = "";
    for (let i = 0; i < length; i++) word += alphabet[Math.floor(rng() * alphabet.length)];
    out.add(word);
  }
  return [...out];
}

/** Queries made by applying 0 to 2 random edits (substitute, delete, insert, transpose) to lexicon words, plus a few random strings. */
export function generateQueries(lexicon: readonly string[], count: number, seed: number): string[] {
  const rng = mulberry32(seed);
  const alphabet = [...new Set(lexicon.join(""))];
  const pickChar = () => alphabet[Math.floor(rng() * alphabet.length)] ?? "a";
  const out: string[] = [];
  while (out.length < count) {
    if (rng() < 0.1) {
      let random = "";
      for (let i = 0, n = 4 + Math.floor(rng() * 8); i < n; i++) random += pickChar();
      out.push(random);
      continue;
    }
    let q = lexicon[Math.floor(rng() * lexicon.length)] ?? "";
    for (let e = Math.floor(rng() * 3); e > 0 && q.length > 1; e--) {
      const i = Math.floor(rng() * q.length);
      switch (Math.floor(rng() * 4)) {
        case 0:
          q = q.slice(0, i) + pickChar() + q.slice(i + 1);
          break;
        case 1:
          q = q.slice(0, i) + q.slice(i + 1);
          break;
        case 2:
          q = q.slice(0, i) + pickChar() + q.slice(i);
          break;
        default:
          if (i + 1 < q.length) q = q.slice(0, i) + q[i + 1] + q[i] + q.slice(i + 2);
      }
    }
    out.push(q);
  }
  return out;
}
