// Synthetic catalog generator.
//
// The real UMak catalog is not available, so the lexicon is synthetic. It mixes a
// seed list of real academic words with pseudo-words built from an English-like
// syllable model, plus Filipino/English style surnames. Call-number tokens follow
// the Dewey pattern used in the milestone (e.g. "005.133", "j23").
//
// LIMITATION: branching-factor and pruning statistics depend on the real
// character distribution of the catalog. Results on synthetic data are
// indicative, not a substitute for a run on the actual holdings.
import { mulberry32, pick, randInt } from "../prng.ts";
import type { Rng } from "../prng.ts";

export type LexiconKind = "words" | "callnos";

const SEED_WORDS = (
  "introduction principles fundamentals algorithms complexity analysis design " +
  "systems networks security database management information engineering " +
  "software computer science mathematics calculus statistics probability " +
  "physics chemistry biology economics accounting finance marketing " +
  "philippine history literature philosophy psychology sociology education " +
  "curriculum pedagogy research methods qualitative quantitative thesis " +
  "constitution criminal procedure evidence contracts property torts " +
  "taxation corporation agency obligations jurisprudence legal ethics " +
  "nursing anatomy physiology pharmacology pathology medicine public health " +
  "architecture structural thermodynamics mechanics circuits electronics " +
  "programming python javascript typescript structures operating compilers " +
  "artificial intelligence learning neural data mining visualization " +
  "linguistics grammar composition rhetoric poetry fiction drama essays " +
  "ancient modern medieval colonial revolution democracy governance policy " +
  "environmental ecology geology astronomy oceanography agriculture " +
  "entrepreneurship leadership organizational behavior human resources " +
  "ethics values culture society community development sustainable global " +
  "handbook encyclopedia dictionary almanac atlas manual guide companion " +
  "volume edition revised advanced elementary essential comprehensive " +
  "theory practice applications foundations perspectives readings studies"
).split(" ");

const ONSETS = [
  "", "b", "c", "d", "f", "g", "h", "j", "k", "l", "m", "n", "p", "r", "s", "t",
  "v", "w", "st", "tr", "pr", "br", "ch", "sh", "th", "gr", "cl", "fl", "pl",
  "sp", "sc", "bl", "cr", "dr",
];
const VOWELS = ["a", "e", "i", "o", "u", "a", "e", "i", "o", "ai", "ea", "io", "ou", "ee", "oo"];
const CODAS = ["", "", "", "n", "r", "s", "t", "l", "m", "d", "ng", "nt", "st", "ck", "rt"];

const NAME_SYLLABLES = [
  "ma", "ri", "jo", "sa", "lu", "an", "to", "ba", "ca", "de", "la", "gon", "za",
  "les", "ni", "pa", "ra", "ve", "go", "re", "di", "en", "cia", "san", "tos",
  "cruz", "ber", "nar", "do", "mi", "ro", "al", "var", "ez", "li", "ko", "ya",
];

function pseudoWord(rng: Rng): string {
  const syllables = randInt(rng, 1, 4);
  let w = "";
  for (let i = 0; i < syllables; i++) {
    w += pick(rng, ONSETS) + pick(rng, VOWELS) + (i === syllables - 1 || rng() < 0.4 ? pick(rng, CODAS) : "");
  }
  return w;
}

function pseudoSurname(rng: Rng): string {
  const parts = randInt(rng, 2, 4);
  let w = "";
  for (let i = 0; i < parts; i++) w += pick(rng, NAME_SYLLABLES);
  return w;
}

function digits(rng: Rng, n: number): string {
  let s = "";
  for (let i = 0; i < n; i++) s += String(randInt(rng, 0, 9));
  return s;
}

function callNumberToken(rng: Rng): string {
  const r = rng();
  if (r < 0.5) return `${digits(rng, 3)}.${digits(rng, randInt(rng, 1, 3))}`; // Dewey: 005.133
  if (r < 0.8) return `${String.fromCharCode(97 + randInt(rng, 0, 25))}${digits(rng, randInt(rng, 2, 3))}`; // cutter: j23
  return `978${digits(rng, 10)}`; // ISBN-13
}

/** Generate `size` unique lowercase tokens. Deterministic for a given seed. */
export function generateLexicon(kind: LexiconKind, size: number, seed = 1): string[] {
  const rng = mulberry32(seed);
  const out = new Set<string>();
  if (kind === "words") for (const w of SEED_WORDS) if (out.size < size) out.add(w);
  let attempts = 0;
  const maxAttempts = size * 200;
  while (out.size < size && attempts++ < maxAttempts) {
    let token: string;
    if (kind === "callnos") token = callNumberToken(rng);
    else token = rng() < 0.25 ? pseudoSurname(rng) : pseudoWord(rng);
    if (token.length >= 3 && token.length <= 24) out.add(token);
  }
  if (out.size < size) {
    throw new Error(`could only generate ${out.size} unique ${kind} tokens (wanted ${size})`);
  }
  return [...out];
}

export interface QueryCase {
  text: string;
  /** The lexicon word the typo was derived from, or null for a random no-match string. */
  source: string | null;
  /** Number of random edit operations applied (transposition counts as one op). */
  edits: number;
}

function alphabetOf(lexicon: readonly string[]): string[] {
  const s = new Set<string>();
  for (const w of lexicon) for (const ch of w) s.add(ch);
  return [...s].sort();
}

function applyEdit(rng: Rng, s: string, alphabet: readonly string[]): string {
  const op = randInt(rng, 0, 3);
  if (s.length === 0) return pick(rng, alphabet);
  const i = randInt(rng, 0, s.length - 1);
  switch (op) {
    case 0: // substitution
      return s.slice(0, i) + pick(rng, alphabet) + s.slice(i + 1);
    case 1: // deletion (keep at least 1 char)
      return s.length > 1 ? s.slice(0, i) + s.slice(i + 1) : s;
    case 2: // insertion
      return s.slice(0, i) + pick(rng, alphabet) + s.slice(i);
    default: // adjacent transposition
      if (i + 1 < s.length) return s.slice(0, i) + s[i + 1] + s[i] + s.slice(i + 2);
      return s;
  }
}

export interface QueryOptions {
  count: number;
  seed?: number;
  /** Fraction of queries that are random strings unlikely to match anything. */
  noMatchFraction?: number;
  /** Min/max query length (after typos) to include. */
  minLen?: number;
  maxLen?: number;
  /** Edit counts to draw from, e.g. [0,1,2]. */
  editChoices?: readonly number[];
}

export function generateQueries(lexicon: readonly string[], opts: QueryOptions): QueryCase[] {
  const rng = mulberry32(opts.seed ?? 7);
  const alphabet = alphabetOf(lexicon);
  const minLen = opts.minLen ?? 3;
  const maxLen = opts.maxLen ?? 64;
  const editChoices = opts.editChoices ?? [0, 1, 2];
  const noMatch = opts.noMatchFraction ?? 0.05;
  const out: QueryCase[] = [];
  let guard = 0;
  while (out.length < opts.count && guard++ < opts.count * 200) {
    if (rng() < noMatch) {
      const len = randInt(rng, Math.max(minLen, 4), Math.min(maxLen, 14));
      let s = "";
      for (let i = 0; i < len; i++) s += pick(rng, alphabet);
      out.push({ text: s, source: null, edits: -1 });
      continue;
    }
    const word = pick(rng, lexicon);
    if (word.length < minLen - 2 || word.length > maxLen + 2) continue;
    const edits = pick(rng, editChoices);
    let q = word;
    for (let e = 0; e < edits; e++) q = applyEdit(rng, q, alphabet);
    if (q.length < minLen || q.length > maxLen) continue;
    out.push({ text: q, source: word, edits });
  }
  if (out.length < opts.count) throw new Error("could not generate enough queries for the requested length range");
  return out;
}
