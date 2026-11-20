// Editions of one work, and the order search results are shown in. Pure, so
// it is tested without a database: the API reads the Books and their live
// availability and Loan counts, then hands them here.

import { tokenize } from "./catalog-index.ts";

/** Words that name an edition: "ed.", "edn", "edition". Only removed after a qualifier such as "2nd" or "revised". */
const EDITION_NOUNS = new Set(["ed", "edn", "edition"]);

const WORD_ORDINALS = [
  "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth",
  "eleventh", "twelfth", "thirteenth", "fourteenth", "fifteenth", "sixteenth", "seventeenth", "eighteenth", "nineteenth", "twentieth",
];
const QUALIFIERS = new Set([...WORD_ORDINALS, "revised", "rev", "updated", "expanded", "enlarged", "new", "international", "abridged", "unabridged"]);
const NUMERIC_ORDINAL = /^\d+(st|nd|rd|th)$/;

const isQualifier = (word: string) => QUALIFIERS.has(word) || NUMERIC_ORDINAL.test(word);

/** The title's words without its edition phrases ("2nd ed.", "Third Edition", "revised ed."). A word like "Second" stays unless an edition noun follows it. */
function titleWords(title: string): string[] {
  const words = tokenize(title);
  const kept: string[] = [];
  for (const word of words) {
    if (EDITION_NOUNS.has(word) && kept.length > 0 && isQualifier(kept[kept.length - 1] ?? "")) {
      while (kept.length > 0 && isQualifier(kept[kept.length - 1] ?? "")) kept.pop();
      continue;
    }
    kept.push(word);
  }
  return kept;
}

/**
 * What makes two Books editions of the same work: the same title once case,
 * punctuation, accents and edition words are set aside, and the same first
 * author. A Book with no author only matches other Books with no author.
 */
export function workKey(title: string, authors: readonly string[]): string {
  return `${titleWords(title).join(" ")}|${tokenize(authors[0] ?? "").join(" ")}`;
}

/** How results can be ordered. Best match is the search index's own ranking. */
export const CATALOG_SORTS = ["best", "newest", "title", "borrowed"] as const;
export type CatalogSort = (typeof CATALOG_SORTS)[number];

/** What arranging needs to know about a matched Book. */
export interface EditionCandidate {
  id: string;
  title: string;
  authors: readonly string[];
  publicationYear: number | null;
  /** Copies on the shelf now. */
  availableCopies: number;
}

export interface ArrangeOptions {
  sort: CatalogSort;
  /** Keep only rows whose shown edition has an available Copy. */
  availableNow: boolean;
  /** Fold editions of one work into one row that shows the newest. */
  latestEditionOnly: boolean;
  /** Loans of each Book confirmed in the most-borrowed window, for `sort: "borrowed"`. A Book that is missing had none. */
  loansInWindow?: ReadonlyMap<string, number>;
}

/** One result row: the Book it shows and, when editions are folded, the other editions of its work, newest first. */
export interface ArrangedRow<T> {
  book: T;
  olderEditions: T[];
}

/** Newer first; a Book with no year after any Book with one. */
const byYearDescending = (a: number | null, b: number | null) => (b ?? -Infinity) - (a ?? -Infinity) || 0;

/**
 * The rows a search shows, from the matched Books in best-match order: editions
 * are folded first (when asked), then Available now keeps the rows whose shown
 * edition has a Copy on the shelf, then the sort applies. Every sort breaks ties
 * in best-match order, and a folded row takes the place of its best-matching edition.
 */
export function arrangeCatalogResults<T extends EditionCandidate>(ranked: readonly T[], options: ArrangeOptions): Array<ArrangedRow<T>> {
  const rank = new Map(ranked.map((book, position) => [book.id, position]));
  const rankOf = (book: T) => rank.get(book.id) ?? 0;

  let rows: Array<ArrangedRow<T> & { place: number }>;
  if (options.latestEditionOnly) {
    // Each work with its best-matching edition (the first one met) and all its editions in best-match order.
    const works = new Map<string, { first: T; editions: T[] }>();
    for (const book of ranked) {
      const key = workKey(book.title, book.authors);
      const work = works.get(key);
      if (work) work.editions.push(book);
      else works.set(key, { first: book, editions: [book] });
    }
    rows = [...works.values()].map(({ first, editions }) => {
      // Stable sort: equal years stay in best-match order.
      const [newest = first, ...older] = [...editions].sort((a, b) => byYearDescending(a.publicationYear, b.publicationYear));
      return { book: newest, olderEditions: older, place: rankOf(first) };
    });
  } else {
    rows = ranked.map((book) => ({ book, olderEditions: [], place: rankOf(book) }));
  }

  if (options.availableNow) rows = rows.filter((row) => row.book.availableCopies > 0);

  const sortKeyed = (compare: (a: T, b: T) => number) => rows.sort((a, b) => compare(a.book, b.book) || a.place - b.place);
  switch (options.sort) {
    case "best":
      rows.sort((a, b) => a.place - b.place);
      break;
    case "newest":
      sortKeyed((a, b) => byYearDescending(a.publicationYear, b.publicationYear));
      break;
    case "title": {
      const sortTitle = new Map(rows.map((row) => [row.book.id, tokenize(row.book.title).join(" ")]));
      const titleOf = (book: T) => sortTitle.get(book.id) ?? "";
      sortKeyed((a, b) => (titleOf(a) < titleOf(b) ? -1 : titleOf(a) > titleOf(b) ? 1 : 0));
      break;
    }
    case "borrowed": {
      const loans = options.loansInWindow ?? new Map<string, number>();
      sortKeyed((a, b) => (loans.get(b.id) ?? 0) - (loans.get(a.id) ?? 0));
      break;
    }
    default: {
      const exhaustive: never = options.sort;
      throw new Error(`Unknown sort ${String(exhaustive)}`);
    }
  }
  return rows.map(({ book, olderEditions }) => ({ book, olderEditions }));
}
