import { z } from "zod";
import type { BookSearchResult } from "./catalog.ts";
import { LIBRARY_UTC_OFFSET_HOURS } from "./loans.ts";

/**
 * Announcements: a notice a Librarian publishes to every Member as a poster
 * image. It shows on Home from the start of its first day to the end of its
 * last day, library time, and no two run at the same time. Librarians manage
 * them on the desk page; the image goes through the API only.
 */

/** The largest poster image the API accepts, in bytes (5 MB). */
export const ANNOUNCEMENT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

/** The image types the API accepts, told from the file's content, not its name. */
export const ANNOUNCEMENT_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

/** The smallest 2:1 banner the poster must give, in pixels: anything smaller looks blurred on a phone. */
export const ANNOUNCEMENT_BANNER_MIN_WIDTH = 600;

export const ANNOUNCEMENT_TITLE_MAX_LENGTH = 120;
export const ANNOUNCEMENT_BODY_MAX_LENGTH = 1000;
/** The longest web address a link may have. Real sign-up forms and posts fit easily. */
export const ANNOUNCEMENT_URL_MAX_LENGTH = 500;

/** Where an Announcement is in its life, by the API's clock: showing now, waiting to start, or over. */
export const ANNOUNCEMENT_STATUSES = ["running", "scheduled", "past"] as const;
export type AnnouncementStatus = (typeof ANNOUNCEMENT_STATUSES)[number];

/** The words the API returns and the desk page shows when an Announcement cannot be saved, ended or deleted. */
export const ANNOUNCEMENT_MESSAGES = {
  invalidRequest: "Something in this Announcement could not be read. Check the form and try again.",
  titleRequired: "Add a title. Screen readers read it in place of the poster.",
  titleTooLong: `Keep the title to ${ANNOUNCEMENT_TITLE_MAX_LENGTH} characters or fewer.`,
  bodyTooLong: `Keep the text to ${ANNOUNCEMENT_BODY_MAX_LENGTH} characters or fewer.`,
  webLinkInvalid: "Enter a full web address that starts with https://, or choose No link.",
  webLinkTooLong: `That web address is too long. Use one of ${ANNOUNCEMENT_URL_MAX_LENGTH} characters or fewer, such as the short link of the form.`,
  bookRequired: "Choose the Book to link to, or choose No link.",
  bookNotFound: "That Book is not in the catalog. Search for it again, or choose No link.",
  daysRequired: "Pick the first and last day the Announcement shows.",
  daysOutOfOrder: "Pick an end date on or after the start date.",
  firstDayPast: "Pick a start date from today on. An Announcement cannot start in the past.",
  lastDayPast: "Pick an end date from today on. To take it down now, use End now.",
  overlapGone: "These dates overlap another Announcement that just changed. Reload the list and pick the dates again.",
  cropInvalid: "Drag the frame to choose what shows on Home, then save again.",
  imageRequired: "Add a poster image: a JPG, PNG or WebP, up to 5 MB.",
  imageType: "Use a JPG, PNG or WebP image. This file is not one, whatever its name says.",
  imageTooLarge: "That image is larger than 5 MB. Save it smaller or as a JPG and upload it again.",
  imageTooSmall: `That image is too small to look sharp on a phone. Use one at least ${ANNOUNCEMENT_BANNER_MIN_WIDTH} pixels wide.`,
  imageUnreadable: "That image could not be read. It may be damaged: export it again and upload it.",
  notFound: "This Announcement no longer exists. It may have been deleted on another desk.",
  pastReadOnly: "This Announcement is over, so it cannot be changed. Use Copy as new to run it again.",
  endNotRunning: "Only the Announcement showing now can be ended. A scheduled one can be deleted instead.",
  deleteNotScheduled: "Only a scheduled Announcement that has not started can be deleted. End the one showing now instead.",
  changedElsewhere: "Someone changed this Announcement on another desk while you were editing it. Reload the list and make your change again.",
  storageFailed: "The poster could not be stored. Nothing was saved. Please try again.",
} as const;

/** The refusal of dates that overlap another Announcement, naming it and its dates. */
export function announcementOverlapMessage(other: { title: string; firstDay: string; lastDay: string }): string {
  return `These dates overlap “${other.title}” (${formatAnnouncementDay(other.firstDay)} to ${formatAnnouncementDay(other.lastDay)}). Only one Announcement shows at a time: pick dates outside it, or end that one first.`;
}

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const OFFSET_MS = LIBRARY_UTC_OFFSET_HOURS * HOUR_MS;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** A library calendar day, "2026-11-26". */
export type LibraryDay = string;

/** The moment a library day starts (00:00 in Manila), for "2026-11-26". */
export function libraryDayStart(day: LibraryDay): Date {
  return new Date(Date.parse(`${day}T00:00:00.000Z`) - OFFSET_MS);
}

/** The library day a moment falls on: "2026-11-26". */
export function libraryDayOf(moment: Date): LibraryDay {
  return new Date(moment.getTime() + OFFSET_MS).toISOString().slice(0, 10);
}

/** The library day after `day`. */
export function nextLibraryDay(day: LibraryDay): LibraryDay {
  return new Date(Date.parse(`${day}T00:00:00.000Z`) + DAY_MS).toISOString().slice(0, 10);
}

/** "Nov 26, 2026": a library day as the desk page and the app write it. */
export function formatAnnouncementDay(day: LibraryDay): string {
  const [year, month, date] = day.split("-").map(Number) as [number, number, number];
  return `${MONTHS[month - 1]} ${date}, ${year}`;
}

/**
 * "Nov 17, 2026 to Nov 28, 2026 · University Library": the dates line under an Announcement's title in the app, with
 * one day for an Announcement that runs for one.
 */
export function announcementDatesLine(firstDay: LibraryDay, lastDay: LibraryDay): string {
  const first = formatAnnouncementDay(firstDay);
  const days = firstDay === lastDay ? first : `${first} to ${formatAnnouncementDay(lastDay)}`;
  return `${days} · University Library`;
}

/** Whether `text` is a web address an Announcement may link to: https, a real host name, no user name or password. */
export function isAnnouncementWebLink(text: string): boolean {
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return false;
  }
  return url.protocol === "https:" && url.hostname.includes(".") && url.username === "" && url.password === "" && !/\s/.test(text);
}

/** "forms.gle": the site a web link opens, as its button names it ("Open forms.gle"). */
export function announcementLinkSite(url: string): string {
  return new URL(url).hostname.replace(/^www\./, "");
}

const libraryDaySchema = z.iso.date({ error: ANNOUNCEMENT_MESSAGES.daysRequired });

/** The one optional link of an Announcement: nothing, a Book of the catalog, or an https web page. */
export const announcementLinkInputSchema = z.discriminatedUnion(
  "kind",
  [
    z.strictObject({ kind: z.literal("none") }),
    z.strictObject({ kind: z.literal("book"), bookId: z.uuid({ error: ANNOUNCEMENT_MESSAGES.bookRequired }) }),
    z.strictObject({
      kind: z.literal("web"),
      url: z
        .string({ error: ANNOUNCEMENT_MESSAGES.webLinkInvalid })
        .trim()
        .max(ANNOUNCEMENT_URL_MAX_LENGTH, ANNOUNCEMENT_MESSAGES.webLinkTooLong)
        .refine(isAnnouncementWebLink, ANNOUNCEMENT_MESSAGES.webLinkInvalid),
    }),
  ],
  { error: ANNOUNCEMENT_MESSAGES.invalidRequest },
);
export type AnnouncementLinkInput = z.infer<typeof announcementLinkInputSchema>;

/**
 * What a Librarian fills in for an Announcement, sent as the `details` field
 * (JSON) of the form that creates or edits one. The poster image travels
 * beside it as the `image` file field.
 */
export const announcementDetailsSchema = z
  .strictObject({
    title: z
      .string({ error: ANNOUNCEMENT_MESSAGES.titleRequired })
      .trim()
      .min(1, ANNOUNCEMENT_MESSAGES.titleRequired)
      .max(ANNOUNCEMENT_TITLE_MAX_LENGTH, ANNOUNCEMENT_MESSAGES.titleTooLong),
    /** Optional text under the poster. Empty means none. */
    body: z
      .string({ error: ANNOUNCEMENT_MESSAGES.invalidRequest })
      .trim()
      .max(ANNOUNCEMENT_BODY_MAX_LENGTH, ANNOUNCEMENT_MESSAGES.bodyTooLong)
      .transform((text) => (text === "" ? null : text)),
    link: announcementLinkInputSchema,
    firstDay: libraryDaySchema,
    lastDay: libraryDaySchema,
    /**
     * Where the 2:1 banner sits on the poster, from 0 (top, or left for a poster
     * wider than 2:1) to 1 (bottom, or right). The banner always spans the
     * poster's full width (or full height when it is wider than 2:1).
     */
    cropPosition: z.number({ error: ANNOUNCEMENT_MESSAGES.cropInvalid }).min(0, ANNOUNCEMENT_MESSAGES.cropInvalid).max(1, ANNOUNCEMENT_MESSAGES.cropInvalid),
  })
  .refine((details) => details.lastDay >= details.firstDay, { message: ANNOUNCEMENT_MESSAGES.daysOutOfOrder, path: ["lastDay"] });
export type AnnouncementDetails = z.input<typeof announcementDetailsSchema>;
export type ParsedAnnouncementDetails = z.output<typeof announcementDetailsSchema>;

/** The link of an Announcement as the API returns it. */
export type AnnouncementLink = { kind: "book"; bookId: string; bookTitle: string } | { kind: "web"; url: string };

/** An Announcement's poster: the full image resized for phones and the 2:1 banner cut from it, both public addresses. */
export interface AnnouncementImage {
  /** The whole poster, never cropped: the detail screen shows it. JPEG. */
  posterUrl: string;
  posterWidth: number;
  posterHeight: number;
  /** The 2:1 banner Home shows, cut from the poster at `cropPosition`. JPEG. */
  bannerUrl: string;
  /** Where the banner sits on the poster, 0 to 1 (see `announcementDetailsSchema`). */
  cropPosition: number;
}

/** An Announcement as the desk page shows it. */
export interface Announcement {
  id: string;
  title: string;
  body: string | null;
  link: AnnouncementLink | null;
  image: AnnouncementImage;
  /** The first library day it shows. */
  firstDay: LibraryDay;
  /** The last library day it shows (the day it was ended, for one ended early). */
  lastDay: LibraryDay;
  /** When it starts showing: the start of `firstDay`, ISO 8601. */
  startsAt: string;
  /** When it stops showing: the end of `lastDay`, or the moment it was ended. ISO 8601, exclusive. */
  endsAt: string;
  status: AnnouncementStatus;
  /** The Librarians who created it and last changed it, by name. */
  createdBy: string;
  updatedBy: string;
  /** When it was last changed, ISO 8601. */
  updatedAt: string;
}

/**
 * The running Announcement as a Member receives it in `GET /home`: no Librarian names, no status (only the
 * running one is ever sent) and no edit time.
 */
export type MemberAnnouncement = Pick<Announcement, "id" | "title" | "body" | "link" | "image" | "firstDay" | "lastDay" | "startsAt" | "endsAt">;

/** `GET /desk/announcements`: the one showing now, the scheduled ones (soonest first), and the past ones (latest first). */
export interface DeskAnnouncementsResponse {
  running: Announcement | null;
  scheduled: Announcement[];
  past: Announcement[];
}

/** The body of a create, edit or End now. */
export interface AnnouncementResponse {
  announcement: Announcement;
}

/** `GET /desk/announcements/books?q=`: Books a Librarian can link an Announcement to, best match first. */
export interface AnnouncementBooksResponse {
  books: BookSearchResult[];
}
