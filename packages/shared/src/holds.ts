import { z } from "zod";

/**
 * The states of a Hold (ADR 0001, spec #2):
 * - `waiting`: in the Book's queue, no Copy set aside yet;
 * - `ready`: a Copy is set aside for the Member and the Pickup Window is running;
 * - `fulfilled`: the Member borrowed the Copy;
 * - `expired`: the Pickup Window passed;
 * - `cancelled`: the Member left the queue.
 */
export const HOLD_STATUSES = ["waiting", "ready", "fulfilled", "expired", "cancelled"] as const;
export type HoldStatus = (typeof HOLD_STATUSES)[number];

/** A Hold still holds a place: it is waiting or ready. A Member has at most one active Hold per Book. */
export function isActiveHold(status: HoldStatus): boolean {
  return status === "waiting" || status === "ready";
}

/** The words a Member reads for each status. */
export const HOLD_STATUS_LABELS: Record<HoldStatus, string> = {
  waiting: "Waiting",
  ready: "Ready for pickup",
  fulfilled: "Borrowed",
  expired: "Expired",
  cancelled: "Cancelled",
};

/** The words the API and the app both show when a Hold cannot be placed or cancelled. */
export const HOLD_MESSAGES = {
  invalidRequest: "Open the Book again and try placing the Hold from there.",
  invalidId: "This Hold could not be found. Open your Holds and try again.",
  cannotBorrow: "Your Account Type cannot borrow, so it cannot place Holds. You can still see which Copies are available and visit the library.",
  copyAvailable: "A Copy of this Book is available now. Show your Digital ID to the librarian at the desk to borrow it instead of placing a Hold.",
  alreadyHeld: "You already have a Hold on this Book. You can see it in your Holds.",
  holdNotFound: "This Hold could not be found. Open your Holds and try again.",
  notCancellable: "This Hold can no longer be cancelled.",
  changed: "This Hold changed while it was being cancelled, so nothing was cancelled. Open your Holds and try again.",
} as const;

/** One of the Member's Holds. */
export interface Hold {
  id: string;
  bookId: string;
  bookTitle: string;
  /** One entry per author, "Surname, Given". */
  bookAuthors: string[];
  status: HoldStatus;
  /** When the Hold was placed, ISO 8601, by the API's clock. */
  placedAt: string;
  /**
   * The end of the Pickup Window, ISO 8601: until then a Copy is set aside for the
   * Member. Null while the Hold is waiting, and for a Hold that was never chosen.
   */
  pickupEndsAt: string | null;
}

/** The body of `POST /holds`. */
export const placeHoldRequestSchema = z.object({ bookId: z.uuid() }).strict();
export type PlaceHoldRequest = z.infer<typeof placeHoldRequestSchema>;

/** A Hold id as it appears in `POST /holds/:id/cancel`. */
export const holdIdSchema = z.uuid(HOLD_MESSAGES.invalidId);

/** The body of `POST /holds`: the Hold, now waiting. */
export interface PlaceHoldResponse {
  hold: Hold;
}

/** The body of `GET /members/me/holds`: every Hold of the Member, active ones first and each group newest first. */
export interface MyHoldsResponse {
  holds: Hold[];
}

/** The body of `POST /holds/:id/cancel`: the Hold, now cancelled. */
export interface CancelHoldResponse {
  hold: Hold;
}
