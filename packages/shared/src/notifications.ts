import { z } from "zod";
import { libraryDayOf } from "./announcements.ts";
import { formatLibraryDate } from "./loans.ts";
import { counted } from "./plural.ts";
import { pushDestination } from "./push.ts";
import type { PushDestination, PushKind } from "./push.ts";

/**
 * Notifications (GLOSSARY: Notification): the entries of a Member's
 * notification inbox, which opens from the bell on Home. There is one for each
 * event a push notification is about (a Hold ready, a Loan due tomorrow, a Loan
 * now overdue, a new Announcement), whatever the Member's push switches say and
 * whether or not the app can get push notifications at all.
 */

/** The kinds of Notification: the same four events as push notifications. */
export type NotificationKind = PushKind;

/** What a tapped Notification is about: the Hold, the Loan or the Announcement. */
export type NotificationSubject =
  | { kind: "hold"; holdId: string }
  | { kind: "loan"; loanId: string }
  | { kind: "announcement"; announcementId: string };

/** One Notification of the signed-in Member. */
export interface MemberNotification {
  /** Names it for `POST /members/me/notifications/:id/read`. */
  id: string;
  kind: NotificationKind;
  title: string;
  /** One line of text under the title. */
  body: string;
  /** When it happened, ISO 8601, by the API's clock (the start of an Announcement). */
  at: string;
  read: boolean;
  /** What it is about, which says the screen a tap opens (`notificationDestination`). */
  about: NotificationSubject;
}

/** How many Notifications one page of `GET /members/me/notifications` holds at most. */
export const NOTIFICATIONS_PAGE_SIZE = 30;

/**
 * The query of `GET /members/me/notifications`: `before` is the `nextCursor`
 * of the page before, to read the next (older) page. Without it, the newest.
 */
export const notificationsQuerySchema = z.strictObject({ before: z.string().min(1).max(200).optional() });

/** The body of `GET /members/me/notifications`: a page of the Member's Notifications, newest first. */
export interface MyNotificationsResponse {
  notifications: MemberNotification[];
  /** Pass as `before` for the next page; null on the last page. */
  nextCursor: string | null;
  /** How many of all the Member's Notifications are unread. */
  unread: number;
}

/**
 * The body of `GET /members/me/notifications/unread`, and of marking one or
 * all read: how many of the Member's Notifications are unread now.
 */
export interface NotificationsUnreadResponse {
  unread: number;
}

/** A Notification id in a path. */
export const notificationIdSchema = z.uuid();

/** The screen a tapped Notification opens: the same one a tap on its push notification opens. */
export function notificationDestination(notification: Pick<MemberNotification, "kind">): PushDestination {
  const destination = pushDestination({ kind: notification.kind });
  if (destination === undefined) throw new Error(`No screen for Notifications of kind ${notification.kind}`);
  return destination;
}

/** The most the unread badge on the bell spells out: above it, it reads "9+". */
export const UNREAD_BADGE_MAX = 9;

/** The text of the unread badge on the bell: nothing at zero (no badge), the count up to nine, then "9+". */
export function unreadBadgeText(unread: number): string | undefined {
  if (unread <= 0) return undefined;
  return unread > UNREAD_BADGE_MAX ? `${UNREAD_BADGE_MAX}+` : String(unread);
}

/** The bell's name for a screen reader: "Notifications", or "Notifications, 3 unread". */
export function bellLabel(unread: number): string {
  return unread > 0 ? `Notifications, ${unread} unread` : "Notifications";
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const WEEK_DAYS = 7;

/**
 * How long ago a Notification happened, as its row says it: "Just now",
 * "5 minutes ago", "3 hours ago", then by the library's calendar "Yesterday"
 * and "4 days ago", and the date ("Nov 12, 2026") from a week back.
 */
export function notificationAge(atIso: string, now: Date): string {
  const at = new Date(atIso);
  const elapsed = now.getTime() - at.getTime();
  if (elapsed < MINUTE_MS) return "Just now";
  if (elapsed < HOUR_MS) return `${counted(Math.floor(elapsed / MINUTE_MS), "minute")} ago`;
  if (elapsed < DAY_MS) return `${counted(Math.floor(elapsed / HOUR_MS), "hour")} ago`;
  const days = Math.round((Date.parse(libraryDayOf(now)) - Date.parse(libraryDayOf(at))) / DAY_MS);
  if (days <= 1) return "Yesterday";
  if (days < WEEK_DAYS) return `${days} days ago`;
  return formatLibraryDate(atIso);
}

/** The words of the Notifications screen and its refusals. */
export const NOTIFICATION_MESSAGES = {
  empty: "Ready Holds, Loans due soon and library Announcements show up here.",
  loadFailed: "Your notifications could not be loaded. Please try again.",
  markFailed: "That could not be saved. Check your connection and try again.",
  invalidId: "This notification could not be found. Open your notifications again.",
  invalidCursor: "Open your notifications again to see older ones.",
  notFound: "This notification could not be found. Open your notifications again.",
} as const;
