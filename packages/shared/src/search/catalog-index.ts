// The catalog search index: title and author words go through the Bounded
// Levenshtein Trie (typo tolerant); ISBN, accession number and LC call number
// are matched exactly. Pure functions over plain data, so it is tested without
// a database or a server.
//
// A CatalogIndex is immutable. The API builds a new one when the catalog
// changes and swaps the reference; a search that already started finishes on
// the index it began with.

import { buildTrie, searchTrie } from "./flat-trie.ts";
import type { FlatTrie } from "./flat-trie.ts";

/** What the index needs to know about one Book. Availability is not here: it changes with every Loan and is read live. */
export interface IndexedBook {
  id: string;
  title: string;
  /** One entry per author, in any "Surname, Given" or plain form. */
  authors: readonly string[];
  isbn?: string | null;
  callNumber?: string | null;
  /** Accession numbers of the Book's Copies. */
  accessionNumbers?: readonly string[];
}

export interface CatalogHit {
  bookId: string;
  /** Sum over the query's words of the edit distance to the closest word of the Book. 0 is an exact match. */
  distance: number;
}

export interface CatalogSearchResult {
  /** How many Books matched, before `limit` was applied. */
  total: number;
  /** Best match first. Equal matches stay in the order the Books were given to `buildCatalogIndex`. */
  hits: CatalogHit[];
}

export interface CatalogSearchOptions {
  /** At most this many hits are returned. Default: all of them. */
  limit?: number;
}

export interface CatalogIndex {
  readonly bookCount: number;
  /** Distinct title and author words in the trie. The benchmark scale is about 50,000. */
  readonly tokenCount: number;
  search(query: string, options?: CatalogSearchOptions): CatalogSearchResult;
}

const PLAIN_ASCII = /^[ -~]*$/;

/** Lowercase, accents removed. "María" becomes "maria". */
export function normalizeText(text: string): string {
  // Most catalog text is plain ASCII, where there is no accent to remove: skip the slow Unicode pass.
  return PLAIN_ASCII.test(text) ? text.toLowerCase() : text.normalize("NFD").replace(/\p{M}+/gu, "").toLowerCase();
}

/** The words of a text: normalised, split on anything that is not a letter or a digit. */
export function tokenize(text: string): string[] {
  return normalizeText(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 0);
}

/** How many typos a word of this length may have: none up to 3 letters, one up to 6, two beyond. */
export function typoBoundFor(wordLength: number): number {
  if (wordLength <= 3) return 0;
  if (wordLength <= 6) return 1;
  return 2;
}

/** The form identifiers are compared in: letters and digits only, upper case. "QA76.9 .D3" and "qa769d3" are the same. */
function identifierKey(text: string): string {
  return normalizeText(text).replace(/[^\p{L}\p{N}]+/gu, "").toUpperCase();
}

class TrieCatalogIndex implements CatalogIndex {
  readonly bookCount: number;
  readonly tokenCount: number;
  readonly #bookIds: readonly string[];
  readonly #trie: FlatTrie;
  /** Posting list of word w: `postings[postingStart[w] .. postingStart[w + 1])`, indexes into `#bookIds`. */
  readonly #postingStart: Int32Array;
  readonly #postings: Int32Array;
  readonly #identifiers: ReadonlyMap<string, readonly number[]>;

  constructor(books: readonly IndexedBook[]) {
    this.#bookIds = books.map((book) => book.id);
    this.bookCount = books.length;

    const booksOfWord = new Map<string, number[]>();
    const identifiers = new Map<string, number[]>();
    const addIdentifier = (value: string | null | undefined, bookIndex: number) => {
      const key = value ? identifierKey(value) : "";
      if (key === "") return;
      const list = identifiers.get(key);
      if (!list) identifiers.set(key, [bookIndex]);
      else if (list[list.length - 1] !== bookIndex) list.push(bookIndex);
    };
    books.forEach((book, bookIndex) => {
      for (const word of new Set([...tokenize(book.title), ...book.authors.flatMap(tokenize)])) {
        const list = booksOfWord.get(word);
        if (list) list.push(bookIndex);
        else booksOfWord.set(word, [bookIndex]);
      }
      addIdentifier(book.isbn, bookIndex);
      addIdentifier(book.callNumber, bookIndex);
      for (const accession of book.accessionNumbers ?? []) addIdentifier(accession, bookIndex);
    });

    const words = [...booksOfWord.keys()];
    this.tokenCount = words.length;
    this.#trie = buildTrie(words);
    this.#postingStart = new Int32Array(words.length + 1);
    let total = 0;
    for (const list of booksOfWord.values()) total += list.length;
    this.#postings = new Int32Array(total);
    let offset = 0;
    words.forEach((word, wordIndex) => {
      this.#postingStart[wordIndex] = offset;
      for (const bookIndex of booksOfWord.get(word) ?? []) this.#postings[offset++] = bookIndex;
    });
    this.#postingStart[words.length] = offset;
    this.#identifiers = identifiers;
  }

  search(query: string, options: CatalogSearchOptions = {}): CatalogSearchResult {
    const exact = this.#identifiers.get(identifierKey(query)) ?? [];
    const byDistance = this.#matchWords(query);
    const ranked: Array<[bookIndex: number, distance: number]> = exact.map((bookIndex) => [bookIndex, 0]);
    const isExact = new Set(exact);
    const wordHits = [...byDistance].filter(([bookIndex]) => !isExact.has(bookIndex));
    wordHits.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    ranked.push(...wordHits);

    const limit = options.limit ?? ranked.length;
    return {
      total: ranked.length,
      hits: ranked.slice(0, limit).map(([bookIndex, distance]) => ({ bookId: this.#bookIds[bookIndex] ?? "", distance })),
    };
  }

  /** Books that match every word of the query (each within its typo bound), with the summed distance. */
  #matchWords(query: string): Map<number, number> {
    const words = [...new Set(tokenize(query))];
    if (words.length === 0) return new Map();
    const perWord: Array<Map<number, number>> = [];
    for (const word of words) {
      const best = new Map<number, number>();
      for (const match of searchTrie(this.#trie, word, typoBoundFor(word.length))) {
        const start = this.#postingStart[match.wordIndex] ?? 0;
        const end = this.#postingStart[match.wordIndex + 1] ?? start;
        for (let p = start; p < end; p++) {
          const bookIndex = this.#postings[p] ?? 0;
          const known = best.get(bookIndex);
          if (known === undefined || match.distance < known) best.set(bookIndex, match.distance);
        }
      }
      if (best.size === 0) return new Map();
      perWord.push(best);
    }
    perWord.sort((a, b) => a.size - b.size);
    const [smallest, ...others] = perWord;
    const result = new Map<number, number>();
    for (const [bookIndex, first] of smallest ?? []) {
      let sum = first;
      let inAll = true;
      for (const other of others) {
        const distance = other.get(bookIndex);
        if (distance === undefined) {
          inAll = false;
          break;
        }
        sum += distance;
      }
      if (inAll) result.set(bookIndex, sum);
    }
    return result;
  }
}

/** Builds the index for `books`. Equal matches are returned in this order, so pass the Books sorted the way results should read (by title). */
export function buildCatalogIndex(books: readonly IndexedBook[]): CatalogIndex {
  return new TrieCatalogIndex(books);
}
