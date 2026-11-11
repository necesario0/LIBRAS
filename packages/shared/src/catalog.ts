import { z } from "zod";

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
