import { z } from "zod";
import { CATALOG_SORTS } from "./search/editions.ts";
import type { CatalogSort } from "./search/editions.ts";
import type { CatalogSuggestion } from "./search/suggestions.ts";
import { LIBRARY_UTC_OFFSET_HOURS } from "./loans.ts";
import { SUBJECTS } from "./subjects.ts";
import type { Subject } from "./subjects.ts";

export const CATALOG_SEARCH_MAX_QUERY_LENGTH = 100;
export const CATALOG_SEARCH_DEFAULT_LIMIT = 20;
export const CATALOG_SEARCH_MAX_LIMIT = 50;

/** The words the API and the app both show for a search that cannot run. */
export const CATALOG_SEARCH_MESSAGES = {
  queryRequired: "Type a title, an author, an ISBN or a call number to search.",
  queryTooLong: `Search for at most ${CATALOG_SEARCH_MAX_QUERY_LENGTH} characters at a time.`,
  invalid: "Check what you typed and try again.",
} as const;

/**
 * Most borrowed counts the Loans confirmed in this many days up to now (a
 * rolling window), so a Book that was popular years ago does not stay on top.
 * The Home shelves use the same window.
 */
export const MOST_BORROWED_WINDOW_DAYS = 180;

/** What the Sort menu calls each order. */
export const CATALOG_SORT_LABELS: Record<CatalogSort, string> = {
  best: "Best match",
  newest: "Newest edition",
  title: "Title A to Z",
  borrowed: "Most borrowed",
};

/**
 * The Published filter as the Member picks it: any time, the last 5 or 10 years
 * (counted back from the library's current year), or a custom range of years
 * with both ends included.
 */
export type PublishedFilter = { kind: "any" } | { kind: "last"; years: 5 | 10 } | { kind: "between"; from: number; to: number };

/** How a Member narrows and orders search results. The query string carries them; anything left out takes its default. */
export interface CatalogSearchFilters {
  sort: CatalogSort;
  /** Only rows whose shown edition has a Copy on the shelf now. */
  availableNow: boolean;
  /** Older editions of a work fold into the row of its newest edition. */
  latestEditionOnly: boolean;
  /** Only Books in one of these Subjects. Empty: any Book, also one with no Subject. */
  subjects: readonly Subject[];
  /** Only Books published in these years. Anything but `any` leaves out Books with no year. */
  published: PublishedFilter;
}

export const DEFAULT_CATALOG_SEARCH_FILTERS: Readonly<CatalogSearchFilters> = {
  sort: "best",
  availableNow: false,
  latestEditionOnly: true,
  subjects: [],
  published: { kind: "any" },
};

/** The earliest and latest year a Published filter can name: four-digit years. */
export const PUBLISHED_YEAR_MIN = 1000;
export const PUBLISHED_YEAR_MAX = 9999;

/** The library's calendar year (Manila time) at `now`. */
export function libraryYear(now: Date): number {
  return new Date(now.getTime() + LIBRARY_UTC_OFFSET_HOURS * 3_600_000).getUTCFullYear();
}

/**
 * The years a Published filter keeps, both ends included; null for an open end.
 * "Last 5 years" in 2026 starts at 2021, as the approved preview counts it.
 */
export function publishedYears(published: PublishedFilter, currentYear: number): { from: number | null; to: number | null } {
  switch (published.kind) {
    case "any":
      return { from: null, to: null };
    case "last":
      return { from: currentYear - published.years, to: null };
    case "between":
      return { from: published.from, to: published.to };
  }
}

/** How many filters of the Filters sheet are on (each Subject counts once): the number on the Filters chip. Sort and Available now have their own chips. */
export function activeFilterCount(filters: CatalogSearchFilters): number {
  return filters.subjects.length + (filters.published.kind === "any" ? 0 : 1) + (filters.latestEditionOnly ? 0 : 1);
}

/** A yes-or-no switch in the query string: exactly "true" or "false", or left out for its default. */
const queryFlag = (fallback: boolean) =>
  z
    .enum(["true", "false"], { error: CATALOG_SEARCH_MESSAGES.invalid })
    .optional()
    .transform((value) => (value === undefined ? fallback : value === "true"));

/** A year in the query string: a whole four-digit number, or left out. */
const queryYear = z.coerce
  .number({ error: CATALOG_SEARCH_MESSAGES.invalid })
  .int(CATALOG_SEARCH_MESSAGES.invalid)
  .min(PUBLISHED_YEAR_MIN, CATALOG_SEARCH_MESSAGES.invalid)
  .max(PUBLISHED_YEAR_MAX, CATALOG_SEARCH_MESSAGES.invalid)
  .optional();

const querySubject = z.enum(SUBJECTS, { error: CATALOG_SEARCH_MESSAGES.invalid });

/**
 * The query string of `GET /catalog/search`. `subject` may repeat (a Book in any
 * of them matches); `publishedFrom` and `publishedTo` are years, both included.
 */
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
  sort: z.enum(CATALOG_SORTS, { error: CATALOG_SEARCH_MESSAGES.invalid }).default(DEFAULT_CATALOG_SEARCH_FILTERS.sort),
  availableNow: queryFlag(DEFAULT_CATALOG_SEARCH_FILTERS.availableNow),
  latestEditionOnly: queryFlag(DEFAULT_CATALOG_SEARCH_FILTERS.latestEditionOnly),
  subject: z
    .union([querySubject, z.array(querySubject)])
    .optional()
    .transform((value): Subject[] => (value === undefined ? [] : [...new Set(Array.isArray(value) ? value : [value])])),
  publishedFrom: queryYear,
  publishedTo: queryYear,
}).refine((query) => query.publishedFrom === undefined || query.publishedTo === undefined || query.publishedFrom <= query.publishedTo, {
  error: CATALOG_SEARCH_MESSAGES.invalid,
});

/** A search as the API runs it once the query string is read: everything but the query text. */
export type CatalogSearchCriteria = Omit<z.output<typeof catalogSearchQuerySchema>, "q">;

/**
 * The query string of a search for `query` with these filters, as `GET /catalog/search` reads it.
 * Filters at their default are left out. `now` places "last 5 years" on the library calendar.
 */
export function catalogSearchQueryString(query: string, filters: CatalogSearchFilters, limit?: number, now: Date = new Date()): string {
  const params = new URLSearchParams({ q: query });
  if (limit !== undefined) params.set("limit", String(limit));
  if (filters.sort !== DEFAULT_CATALOG_SEARCH_FILTERS.sort) params.set("sort", filters.sort);
  if (filters.availableNow !== DEFAULT_CATALOG_SEARCH_FILTERS.availableNow) params.set("availableNow", String(filters.availableNow));
  if (filters.latestEditionOnly !== DEFAULT_CATALOG_SEARCH_FILTERS.latestEditionOnly) {
    params.set("latestEditionOnly", String(filters.latestEditionOnly));
  }
  for (const subject of filters.subjects) params.append("subject", subject);
  const years = publishedYears(filters.published, libraryYear(now));
  if (years.from !== null) params.set("publishedFrom", String(years.from));
  if (years.to !== null) params.set("publishedTo", String(years.to));
  return params.toString();
}

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
  /** Worked out from the LC call number (`subjectFor`); null when the Book has none or its class is not in the table. */
  subject: Subject | null;
  /** Copies that can be borrowed now. */
  availableCopies: number;
  totalCopies: number;
}

/** One row of search results: the Book it shows and, when editions are folded, the older editions of the same work. */
export interface CatalogSearchRow extends BookSearchResult {
  /** Newest first. Empty when no other edition of the work matched, or when Latest edition only is off. */
  olderEditions: BookSearchResult[];
}

/**
 * The body of `GET /catalog/search`. No match is a normal answer with an empty
 * `results`, not an error: a failure is an `ApiErrorBody` with a 4xx or 5xx status.
 */
export interface CatalogSearchResponse {
  /** The query as the API understood it (trimmed). */
  query: string;
  /** How many rows matched, after editions were folded and Available now applied. `results` holds at most `limit` of them, in the order asked for. */
  total: number;
  results: CatalogSearchRow[];
}

/** The body of `GET /catalog/subjects`: the Subjects with at least one Book in the catalog, in table order (`SUBJECTS`). */
export interface CatalogSubjectsResponse {
  subjects: Subject[];
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
  /** Whether the signed-in Member has saved this Book (a Saved book). */
  saved: boolean;
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
