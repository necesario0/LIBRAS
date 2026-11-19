/**
 * Saved books: a Member's private list of Books to find again (GLOSSARY: Saved
 * book). It has no effect on circulation: no queue, no Loan, no audit entry.
 * Every Account Type may save.
 */

/** One of the Member's Saved books, with the Book's availability read live. */
export interface SavedBook {
  bookId: string;
  title: string;
  /** One entry per author, "Surname, Given". */
  authors: string[];
  /** Copies that can be borrowed now. */
  availableCopies: number;
  totalCopies: number;
  /** When the Member saved the Book, ISO 8601, by the API's clock. */
  savedAt: string;
}

/** The body of `GET /members/me/saved-books`: the Member's Saved books, newest first. */
export interface MySavedBooksResponse {
  savedBooks: SavedBook[];
}

/** The body of `PUT` and `DELETE /members/me/saved-books/:bookId`: whether the Book is saved now. Repeating a call gives the same answer. */
export interface SaveBookResponse {
  saved: boolean;
}

/** The words the app shows around Saved books. */
export const SAVED_BOOK_MESSAGES = {
  saveFailed: "We could not save this Book. Check your connection and try again.",
  removeFailed: "We could not remove this Book. Check your connection and try again.",
} as const;
