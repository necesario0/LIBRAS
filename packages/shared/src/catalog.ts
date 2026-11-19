import { z } from "zod";
import type { CatalogSuggestion } from "./search/suggestions.ts";

export const CATALOG_SEARCH_MAX_QUERY_LENGTH = 100;
export const CATALOG_SEARCH_DEFAULT_LIMIT = 20;
export const CATALOG_SEARCH_MAX_LIMIT = 50;

/** The words the API and the app both show for a search that cannot run. */
export const CATALOG_SEARCH_MESSAGES = {
  queryRequired: "Type a title, an author, an ISBN or a call number to search.",
  queryTooLong: `Search for at most ${CATALOG_SEARCH_MAX_QUERY_LENGTH} characters at a time.`,
  invalid: "Check what you typed and try again.",
} as const;

/** The query string of `GET /catalog/search`. */
export const catalogSearchQuerySchema = z.object({
  q: z
    .string({ error: CATALOG_SEARCH_MESSAGES.queryRequired })
    .trim()
    .min(1, CATALOG_SEARCH_MESSAGES.queryRequired)
    .max(CATALOG_SEARCH_MAX_QUERY_LENGTH, CATALOG_SEARCH_MESSAGES.queryTooLong),
  limit: z.coerce
    .number({ error: CATALOG_SEARCH_MESSAGES.invalid })
    .int(CATALOG_SEARCH_MESSAGES.invalid)
    .min(1, CATALOG_SEARCH_MESSAGES.invalid)
    .max(CATALOG_SEARCH_MAX_LIMIT, CATALOG_SEARCH_MESSAGES.invalid)
    .default(CATALOG_SEARCH_DEFAULT_LIMIT),
});

export type CatalogSearchQuery = z.input<typeof catalogSearchQuerySchema>;

/**
 * Where a Copy is: on the shelf (`available`), out with a Member (`on_loan`), or
 * on the hold shelf for the Member of a ready Hold (`set_aside`). Only an
 * available Copy counts towards a Book's availability.
 */
export const COPY_STATUSES = ["available", "on_loan", "set_aside"] as const;
export type CopyStatus = (typeof COPY_STATUSES)[number];

/** One Book in a search result. Availability is read live; it is not part of the search index. */
export interface BookSearchResult {
  id: string;
  title: string;
  /** One entry per author, "Surname, Given". */
  authors: string[];
  edition: string | null;
  publicationYear: number | null;
  isbn: string | null;
  lcCallNumber: string | null;
  /** Copies that can be borrowed now. */
  availableCopies: number;
  totalCopies: number;
}

/**
 * The body of `GET /catalog/search`. No match is a normal answer with an empty
 * `results`, not an error: a failure is an `ApiErrorBody` with a 4xx or 5xx status.
 */
export interface CatalogSearchResponse {
  /** The query as the API understood it (trimmed). */
  query: string;
  /** How many Books matched. `results` holds at most `limit` of them, best match first. */
  total: number;
  results: BookSearchResult[];
}

/** The words the API and the app both show when a Book cannot be opened. */
export const BOOK_MESSAGES = {
  invalidId: "This link to a Book is not valid. Search for the Book again.",
  notFound: "We could not find this Book. It may have been removed from the catalog.",
} as const;

/** A Book id as it appears in `GET /catalog/books/:id`. */
export const bookIdSchema = z.uuid(BOOK_MESSAGES.invalidId);

/** One Book with its details and Copy counts: the fields a search result carries, plus the Book's own texts. */
export interface BookDetail extends BookSearchResult {
  /** What the Book is about, plain text as the library wrote it (line breaks kept). Null when the catalog has none. Search does not use it. */
  summary: string | null;
  /** The Book's table of contents, plain text as the library wrote it. Null when the catalog has none. Search does not use it. */
  contents: string | null;
}

/**
 * The chapters of a Book's table of contents, one per entry: the catalog writes
 * them in one run separated by `--` (MARC style). Each is trimmed and empty ones
 * (a trailing or doubled separator) are dropped. Contents with no separator come
 * back as one entry, line breaks kept; blank contents give none.
 */
export function contentsChapters(contents: string): string[] {
  return contents
    .split("--")
    .map((chapter) => chapter.trim())
    .filter((chapter) => chapter !== "");
}

/**
 * The availability tag of the Book page (approved Tier 3 preview): how many
 * Copies are on the shelf out of all of them, "None available" when every Copy
 * is out or set aside, and "No copies" for a Book the library has none of.
 */
export function bookAvailabilityLabel(book: Pick<BookDetail, "availableCopies" | "totalCopies">): string {
  if (book.totalCopies === 0) return "No copies";
  if (book.availableCopies === 0) return "None available";
  return `${book.availableCopies} of ${book.totalCopies} available`;
}

/** The body of `GET /catalog/books/:id`. Availability is read live from the Copies. */
export interface BookDetailResponse {
  book: BookDetail;
}

/** Suggestions start at this many characters. */
export const CATALOG_SUGGEST_MIN_LENGTH = 2;
/** The most suggestions one answer holds. */
export const CATALOG_SUGGEST_LIMIT = 5;

export const CATALOG_SUGGEST_MESSAGES = {
  tooShort: `Type at least ${CATALOG_SUGGEST_MIN_LENGTH} characters to get suggestions.`,
  invalid: CATALOG_SEARCH_MESSAGES.invalid,
} as const;

/** The query string of `GET /catalog/suggestions`. */
export const catalogSuggestQuerySchema = z.object({
  q: z
    .string({ error: CATALOG_SUGGEST_MESSAGES.tooShort })
    .trim()
    .min(CATALOG_SUGGEST_MIN_LENGTH, CATALOG_SUGGEST_MESSAGES.tooShort)
    .max(CATALOG_SEARCH_MAX_QUERY_LENGTH, CATALOG_SEARCH_MESSAGES.queryTooLong),
});

/**
 * The body of `GET /catalog/suggestions`: up to `CATALOG_SUGGEST_LIMIT` titles
 * (each with the Book it opens) and author names, best first. A title opens its
 * Book; an author runs a search for that author. Only titles and author names:
 * never an accession number, barcode or ISBN.
 */
export interface CatalogSuggestionsResponse {
  /** The query as the API understood it (trimmed). */
  query: string;
  suggestions: CatalogSuggestion[];
}
