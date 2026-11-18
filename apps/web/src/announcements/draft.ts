import type { CSSProperties } from "react";
import {
  ANNOUNCEMENT_IMAGE_MAX_BYTES,
  ANNOUNCEMENT_IMAGE_TYPES,
  ANNOUNCEMENT_MESSAGES,
  announcementDetailsSchema,
  announcementLinkSite,
  announcementOverlapMessage,
  formatAnnouncementDay,
  isAnnouncementWebLink,
} from "@libras/shared";
import type { Announcement, AnnouncementDetails, DeskAnnouncementsResponse, LibraryDay } from "@libras/shared";

/**
 * The Announcement form as the Librarian fills it in. The desk page checks it
 * as they type and says the first thing to fix; the API checks it again and
 * has the last word (the overlap rule above all, which the database enforces).
 */

/** The poster on the form: the one stored (no file to send) or a new one chosen or copied (its file is sent). */
export interface DraftImage {
  /** What the crop box and previews show: a stored address or an object URL. */
  src: string;
  width: number;
  height: number;
  /** The file to upload, or undefined to keep the stored poster. */
  file: Blob | undefined;
}

export type LinkKind = "none" | "book" | "web";

export interface Draft {
  /** The Announcement being edited, or null for a new one (also one copied from a past one). */
  editing: Announcement | null;
  title: string;
  body: string;
  linkKind: LinkKind;
  webUrl: string;
  book: { id: string; title: string } | null;
  firstDay: LibraryDay | "";
  lastDay: LibraryDay | "";
  cropPosition: number;
  image: DraftImage | null;
  /** Untouched since it was opened: no problem is shown yet. */
  pristine: boolean;
}

export function newDraft(): Draft {
  return { editing: null, title: "", body: "", linkKind: "none", webUrl: "", book: null, firstDay: "", lastDay: "", cropPosition: 0.5, image: null, pristine: true };
}

/** The form filled from an Announcement: to edit it, or (with `copy`) to run it again as a new one with new dates. */
export function draftFrom(announcement: Announcement, copy?: { image: DraftImage }): Draft {
  const link = announcement.link;
  return {
    editing: copy ? null : announcement,
    title: announcement.title,
    body: announcement.body ?? "",
    linkKind: link?.kind ?? "none",
    webUrl: link?.kind === "web" ? link.url : "",
    book: link?.kind === "book" ? { id: link.bookId, title: link.bookTitle } : null,
    firstDay: copy ? "" : announcement.firstDay,
    lastDay: copy ? "" : announcement.lastDay,
    cropPosition: announcement.image.cropPosition,
    image: copy
      ? copy.image
      : { src: announcement.image.posterUrl, width: announcement.image.posterWidth, height: announcement.image.posterHeight, file: undefined },
    pristine: true,
  };
}

/** What the API is sent, once the draft has no problem left. */
export function detailsOf(draft: Draft): AnnouncementDetails {
  return {
    title: draft.title,
    body: draft.body,
    link:
      draft.linkKind === "web"
        ? { kind: "web", url: draft.webUrl.trim() }
        : draft.linkKind === "book" && draft.book
          ? { kind: "book", bookId: draft.book.id }
          : { kind: "none" },
    firstDay: draft.firstDay,
    lastDay: draft.lastDay,
    cropPosition: draft.cropPosition,
  };
}

/** The label of the link button under the poster in the app: "Open forms.gle" or "View book". Empty with no link yet. */
export function linkButtonLabel(draft: Draft): string {
  if (draft.linkKind === "web") return isAnnouncementWebLink(draft.webUrl.trim()) ? `Open ${announcementLinkSite(draft.webUrl.trim())}` : "";
  if (draft.linkKind === "book") return draft.book ? "View book" : "";
  return "";
}

export type DraftCheck = { ok: true; message: string } | { ok: false; message: string };

/** The first thing to fix, in the API's own words, or what saving will do. `today` is the library's day. */
export function checkDraft(draft: Draft, list: DeskAnnouncementsResponse | undefined, today: LibraryDay): DraftCheck {
  const refuse = (message: string): DraftCheck => ({ ok: false, message });
  if (!draft.image) return refuse(ANNOUNCEMENT_MESSAGES.imageRequired);
  if (draft.title.trim() === "") return refuse(ANNOUNCEMENT_MESSAGES.titleRequired);
  if (!draft.firstDay || !draft.lastDay) return refuse(ANNOUNCEMENT_MESSAGES.daysRequired);
  if (draft.lastDay < draft.firstDay) return refuse(ANNOUNCEMENT_MESSAGES.daysOutOfOrder);
  // A running one keeps its first day, which is behind it.
  if (draft.firstDay < today && draft.firstDay !== draft.editing?.firstDay) return refuse(ANNOUNCEMENT_MESSAGES.firstDayPast);
  if (draft.lastDay < today) return refuse(ANNOUNCEMENT_MESSAGES.lastDayPast);
  const others = list ? [...(list.running ? [list.running] : []), ...list.scheduled] : [];
  const firstDay = draft.firstDay;
  const lastDay = draft.lastDay;
  const inTheWay = others.find((other) => other.id !== draft.editing?.id && other.firstDay <= lastDay && other.lastDay >= firstDay);
  if (inTheWay) return refuse(announcementOverlapMessage(inTheWay));
  if (draft.linkKind === "web" && !isAnnouncementWebLink(draft.webUrl.trim())) return refuse(ANNOUNCEMENT_MESSAGES.webLinkInvalid);
  if (draft.linkKind === "book" && !draft.book) return refuse(ANNOUNCEMENT_MESSAGES.bookRequired);
  const parsed = announcementDetailsSchema.safeParse(detailsOf(draft));
  if (!parsed.success) return refuse(parsed.error.issues[0]?.message ?? ANNOUNCEMENT_MESSAGES.invalidRequest);
  const from = formatAnnouncementDay(firstDay);
  const until = formatAnnouncementDay(lastDay);
  return { ok: true, message: firstDay <= today ? `Shows on every Member's Home now, until ${until}.` : `Shows on every Member's Home from ${from} to ${until}.` };
}

/** Checks a chosen file before it is read: the type the browser reports and the size. The API reads the real type from the content. */
export function fileProblem(file: File): string | undefined {
  if (!(ANNOUNCEMENT_IMAGE_TYPES as readonly string[]).includes(file.type)) return ANNOUNCEMENT_MESSAGES.imageType;
  if (file.size > ANNOUNCEMENT_IMAGE_MAX_BYTES) return ANNOUNCEMENT_MESSAGES.imageTooLarge;
  return undefined;
}

/** Reads an image's size in the browser, for the crop frame. Rejects when it is not a picture the browser can show. */
export function imageSize(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error("unreadable image"));
    image.src = src;
  });
}

/**
 * Where the 2:1 banner frame sits on the poster, in percent of the poster box:
 * the full width of a poster taller than 2:1, moved down by `position`; the full
 * height of a wider one, moved right. The API cuts the banner the same way.
 */
export function bannerFrame(width: number, height: number, position: number): { left: number; top: number; width: number; height: number } {
  const ratio = width / height;
  if (ratio <= 2) {
    const frameHeight = (ratio / 2) * 100;
    return { left: 0, top: position * (100 - frameHeight), width: 100, height: frameHeight };
  }
  const frameWidth = (2 / ratio) * 100;
  return { left: position * (100 - frameWidth), top: 0, width: frameWidth, height: 100 };
}

/** CSS for a 2:1 box that shows the banner part of the poster, as Home does. */
export function bannerStyle(image: Pick<DraftImage, "src" | "width" | "height">, position: number): CSSProperties {
  const tall = image.width / image.height <= 2;
  return {
    backgroundImage: `url("${image.src}")`,
    backgroundRepeat: "no-repeat",
    backgroundSize: tall ? "100% auto" : "auto 100%",
    backgroundPosition: tall ? `0 ${position * 100}%` : `${position * 100}% 0`,
  };
}
