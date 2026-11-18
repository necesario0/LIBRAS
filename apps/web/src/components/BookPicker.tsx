import { useEffect, useState } from "react";
import type { BookSearchResult } from "@libras/shared";
import { ApiError, GENERIC_ERROR_MESSAGE, findBooksToLink } from "../api.ts";

interface Props {
  book: { id: string; title: string } | null;
  onChange: (book: { id: string; title: string } | null) => void;
  onSessionEnded: () => void;
}

/** Waits for a pause in typing before searching. */
const SEARCH_DELAY_MS = 250;

type Results = { kind: "idle" } | { kind: "found"; books: BookSearchResult[] } | { kind: "failed"; message: string };

/** The Book an Announcement links to: search the catalog by title, author or call number, and pick one. */
export function BookPicker({ book, onChange, onSessionEnded }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Results>({ kind: "idle" });

  useEffect(() => {
    const text = query.trim();
    if (text === "") {
      setResults({ kind: "idle" });
      return;
    }
    const abort = new AbortController();
    const timer = setTimeout(() => {
      findBooksToLink(text, abort.signal).then(
        (books) => {
          if (books === undefined) onSessionEnded();
          else setResults({ kind: "found", books });
        },
        (error: unknown) => {
          if (!abort.signal.aborted) setResults({ kind: "failed", message: error instanceof ApiError ? error.message : GENERIC_ERROR_MESSAGE });
        },
      );
    }, SEARCH_DELAY_MS);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [query, onSessionEnded]);

  if (book) {
    return (
      <div className="book-pick book-pick--chosen">
        <span className="book-pick__title" data-testid="linked-book">
          {book.title}
        </span>
        <button className="link-button" type="button" onClick={() => onChange(null)}>
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="book-pick">
      <input
        className="text-input"
        type="search"
        aria-label="Book"
        placeholder="Search the catalog by title, author or call number"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {results.kind === "failed" && <p className="form-help form-help--error">{results.message}</p>}
      {results.kind === "found" &&
        (results.books.length === 0 ? (
          <p className="form-help">No Book matches. Try fewer words.</p>
        ) : (
          <ul className="book-pick__list" aria-label="Matching Books">
            {results.books.map((found) => (
              <li key={found.id}>
                <button className="book-pick__option" type="button" onClick={() => onChange({ id: found.id, title: found.title })}>
                  <span className="book-pick__title">{found.title}</span>
                  <span className="book-pick__meta">{[found.authors[0], found.lcCallNumber].filter(Boolean).join(" · ")}</span>
                </button>
              </li>
            ))}
          </ul>
        ))}
    </div>
  );
}
