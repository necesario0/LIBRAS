// Turns the Books the index matched while a query was being typed into the
// suggestions the app shows: Book titles (each with the Book it opens) and
// author names. Pure, so it is tested without a database.

import { normalizeText, tokenize, typoBoundFor } from "./catalog-index.ts";

/** A suggestion: a title opens its Book, an author runs a search for that author. Never an ISBN, accession number or barcode. */
export type CatalogSuggestion = { kind: "title"; text: string; bookId: string } | { kind: "author"; text: string };

/** A matched Book, as far as suggestions need it. */
export interface SuggestionSource {
  id: string;
  title: string;
  authors: readonly string[];
}

/** At most this many titles come first, so that authors get room when both match. */
const TITLES_FIRST = 3;

function distanceWithin(a: string, b: string, bound: number): boolean {
  if (Math.abs(a.length - b.length) > bound) return false;
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      row[j] = Math.min((previous[j] ?? 0) + 1, (row[j - 1] ?? 0) + 1, (previous[j - 1] ?? 0) + cost);
    }
    previous = row;
  }
  return (previous[b.length] ?? bound + 1) <= bound;
}

/** Whether every word of the query matches a word of the name: the last one as a start (it is still being typed), the others within the typo bound. */
function authorMatches(queryWords: readonly string[], typing: boolean, author: string): boolean {
  const tokens = tokenize(author);
  return queryWords.every((word, position) => {
    const bound = /\p{N}/u.test(word) ? 0 : typoBoundFor(word.length);
    const isTyped = typing && position === queryWords.length - 1;
    return tokens.some((token) => (isTyped && token.startsWith(word)) || distanceWithin(word, token, bound));
  });
}

/**
 * Up to `limit` suggestions from the Books in match order (best first): titles
 * (one per distinct title) first, then authors (one per distinct name, only names
 * that match what was typed), up to three titles when authors are also there.
 * Room left over goes to further titles.
 */
export function pickSuggestions(query: string, books: readonly SuggestionSource[], limit: number): CatalogSuggestion[] {
  const queryWords = [...new Set(tokenize(query))];
  const typing = /[\p{L}\p{N}]$/u.test(query);

  const titles = new Map<string, CatalogSuggestion>();
  const authors = new Map<string, CatalogSuggestion>();
  for (const book of books) {
    const key = tokenize(book.title).join(" ");
    if (key !== "" && !titles.has(key)) titles.set(key, { kind: "title", text: book.title, bookId: book.id });
    for (const author of book.authors) {
      const authorKey = normalizeText(author).replace(/\s+/g, " ").trim();
      if (authorKey !== "" && !authors.has(authorKey) && authorMatches(queryWords, typing, author)) authors.set(authorKey, { kind: "author", text: author });
    }
  }

  const allTitles = [...titles.values()];
  const allAuthors = [...authors.values()];
  const firstTitles = allTitles.slice(0, TITLES_FIRST);
  const pickedAuthors = allAuthors.slice(0, Math.max(0, limit - firstTitles.length));
  const moreTitles = allTitles.slice(TITLES_FIRST, TITLES_FIRST + Math.max(0, limit - firstTitles.length - pickedAuthors.length));
  return [...firstTitles, ...moreTitles, ...pickedAuthors].slice(0, limit);
}
