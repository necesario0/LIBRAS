// What Home shows a Member besides the search bar. `GET /home` answers with
// all of it, the running Announcement and the shelves, so the app loads Home
// with one call.

import type { MemberAnnouncement } from "./announcements.ts";
import type { BookSearchResult } from "./catalog.ts";
import { SUBJECTS } from "./subjects.ts";
import type { Subject } from "./subjects.ts";

/** The most Books one shelf holds. */
export const HOME_SHELF_LENGTH = 10;

/** The shelves, in the order Home shows them. */
export const HOME_SHELF_KINDS = ["new_arrivals", "popular", "available_now"] as const;
export type HomeShelfKind = (typeof HOME_SHELF_KINDS)[number];

/**
 * One shelf of Home: a heading, a one-line explanation and up to `HOME_SHELF_LENGTH`
 * Books, folded by edition (each shows its newest edition). The API leaves a shelf out
 * when it has no Books, so every shelf it sends has at least one.
 */
export interface HomeShelf {
  kind: HomeShelfKind;
  title: string;
  subtitle: string;
  books: BookSearchResult[];
}

/** The body of `GET /home`. */
export interface HomeResponse {
  /** The Announcement running now, or null: a Member never receives a scheduled, past or ended one. */
  announcement: MemberAnnouncement | null;
  shelves: HomeShelf[];
}

/** What a shelf was picked from: the Member's own college or top Subject, or the whole library. */
export type HomeShelfScope =
  | { kind: "new_arrivals" }
  | { kind: "popular"; college: string | null }
  | { kind: "available_now"; subject: Subject | null; canBorrow: boolean };

/** The heading and the explanation under it, in the approved Tier 3 preview's words. */
export function homeShelfCopy(scope: HomeShelfScope): { title: string; subtitle: string } {
  switch (scope.kind) {
    case "new_arrivals":
      return { title: "New arrivals", subtitle: "The newest Books in the catalog" };
    case "popular":
      return scope.college === null
        ? { title: "Popular in the library", subtitle: "Most borrowed in the last 6 months" }
        : { title: `Popular in ${scope.college}`, subtitle: `Most borrowed by ${scope.college} Members in the last 6 months` };
    case "available_now":
      if (scope.subject !== null) return { title: `Available now in ${scope.subject}`, subtitle: "Your top Subject, from what you have borrowed" };
      return {
        title: "On the shelf now",
        subtitle: scope.canBorrow ? "You can borrow these today" : "You can read these in the library today",
      };
  }
}

/**
 * The Subject borrowed most, or null when there is none (no Loans, or none of their
 * Books has a Subject). Books with no Subject (null) do not count. A tie goes to the
 * Subject that comes first in the table (`SUBJECTS`).
 */
export function topSubject(borrowed: ReadonlyArray<Subject | null>): Subject | null {
  const counts = new Map<Subject, number>();
  for (const subject of borrowed) if (subject !== null) counts.set(subject, (counts.get(subject) ?? 0) + 1);
  let top: Subject | null = null;
  let most = 0;
  for (const subject of SUBJECTS) {
    const count = counts.get(subject) ?? 0;
    if (count > most) {
      top = subject;
      most = count;
    }
  }
  return top;
}
