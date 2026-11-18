import { randomUUID } from "node:crypto";
import { ANNOUNCEMENT_MESSAGES, announcementOverlapMessage, libraryDayOf, libraryDayStart, nextLibraryDay } from "@libras/shared";
import type {
  Announcement,
  AnnouncementLink,
  AnnouncementStatus,
  DeskAnnouncementsResponse,
  ParsedAnnouncementDetails,
} from "@libras/shared";
import type { AppDeps } from "../app.ts";
import { createAuditLog } from "../audit/index.ts";
import type { Identity } from "../auth/auth-provider.ts";
import { withTransaction } from "../db.ts";
import type { Database, Tx } from "../db.ts";
import { AppError } from "../errors.ts";
import { cutBanner, preparePoster } from "./images.ts";
import type { FileStore } from "./storage.ts";

/**
 * Announcements, for Librarians (spec #42). One shows at a time: the database's
 * exclusion constraint `announcements_one_at_a_time` refuses overlapping time
 * ranges, so two overlapping saves at the same moment cannot both succeed.
 * The API also looks for an overlap before it stores any image, to name it
 * without wasted work; the constraint is what makes the rule hold.
 *
 * Files and rows: new images are stored first, under new names, then the row
 * is written. When the row cannot be written the new files are removed; once it
 * is, the files it no longer names are removed. A failure to remove is logged
 * and leaves an unused file, never a row without its image.
 */

type Deps = Pick<AppDeps, "db" | "clock" | "files" | "logger">;

/** How many past Announcements the desk page lists, latest first. Enough to copy last year's events. */
const PAST_LIMIT = 50;

/** PostgreSQL's code for an exclusion constraint refusing a row. */
const EXCLUSION_VIOLATION = "23P01";
const FOREIGN_KEY_VIOLATION = "23503";

interface AnnouncementRow {
  id: string;
  title: string;
  body: string | null;
  link_book_id: string | null;
  link_book_title: string | null;
  link_url: string | null;
  starts_at: Date;
  ends_at: Date;
  poster_path: string;
  banner_path: string;
  poster_width: number;
  poster_height: number;
  crop_position: number;
  created_by_name: string;
  updated_by_name: string;
  updated_at: Date;
}

const SELECT = `
  select a.id, a.title, a.body, a.link_book_id, b.title as link_book_title, a.link_url,
         a.starts_at, a.ends_at, a.poster_path, a.banner_path, a.poster_width, a.poster_height, a.crop_position,
         c.full_name as created_by_name, u.full_name as updated_by_name, a.updated_at
    from public.announcements a
    join public.staff c on c.user_id = a.created_by
    join public.staff u on u.user_id = a.updated_by
    left join public.books b on b.id = a.link_book_id`;

const refusals = {
  notFound: () => new AppError(404, "announcement_not_found", ANNOUNCEMENT_MESSAGES.notFound),
  past: () => new AppError(409, "announcement_past", ANNOUNCEMENT_MESSAGES.pastReadOnly),
  notRunning: () => new AppError(409, "announcement_not_running", ANNOUNCEMENT_MESSAGES.endNotRunning),
  notScheduled: () => new AppError(409, "announcement_not_scheduled", ANNOUNCEMENT_MESSAGES.deleteNotScheduled),
  bookNotFound: () => new AppError(400, "book_not_found", ANNOUNCEMENT_MESSAGES.bookNotFound),
  invalid: (message: string) => new AppError(400, "invalid_request", message),
  changedElsewhere: () => new AppError(409, "announcement_changed", ANNOUNCEMENT_MESSAGES.changedElsewhere),
  storage: (cause: unknown) => new AppError(502, "announcement_storage_failed", ANNOUNCEMENT_MESSAGES.storageFailed, { cause }),
};

function statusAt(row: Pick<AnnouncementRow, "starts_at" | "ends_at">, now: Date): AnnouncementStatus {
  if (row.ends_at.getTime() <= now.getTime()) return "past";
  return row.starts_at.getTime() <= now.getTime() ? "running" : "scheduled";
}

/** The last library day of a range that ends (exclusively) at `endsAt`. */
function lastDayOf(row: Pick<AnnouncementRow, "starts_at" | "ends_at">): string {
  // One ended at the moment it started never showed: its last day is its first.
  return libraryDayOf(new Date(Math.max(row.starts_at.getTime(), row.ends_at.getTime() - 1)));
}

function linkOf(row: AnnouncementRow): AnnouncementLink | null {
  if (row.link_url !== null) return { kind: "web", url: row.link_url };
  if (row.link_book_id !== null) return { kind: "book", bookId: row.link_book_id, bookTitle: row.link_book_title ?? "" };
  return null;
}

function toAnnouncement(row: AnnouncementRow, files: FileStore, now: Date): Announcement {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    link: linkOf(row),
    image: {
      posterUrl: files.publicUrl(row.poster_path),
      posterWidth: row.poster_width,
      posterHeight: row.poster_height,
      bannerUrl: files.publicUrl(row.banner_path),
      cropPosition: row.crop_position,
    },
    firstDay: libraryDayOf(row.starts_at),
    lastDay: lastDayOf(row),
    startsAt: row.starts_at.toISOString(),
    endsAt: row.ends_at.toISOString(),
    status: statusAt(row, now),
    createdBy: row.created_by_name,
    updatedBy: row.updated_by_name,
    updatedAt: row.updated_at.toISOString(),
  };
}

/** Every Announcement for the desk page, as of `clock.now()`. */
export async function listAnnouncements(deps: Pick<Deps, "db" | "clock" | "files">): Promise<DeskAnnouncementsResponse> {
  const now = deps.clock.now();
  const { rows } = await deps.db.query<AnnouncementRow>(
    `(${SELECT} where a.ends_at > $1)
     union all
     (${SELECT} where a.ends_at <= $1 order by a.ends_at desc limit ${PAST_LIMIT})`,
    [now],
  );
  const all = rows.map((row) => toAnnouncement(row, deps.files, now));
  return {
    running: all.find((one) => one.status === "running") ?? null,
    scheduled: all.filter((one) => one.status === "scheduled").sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    past: all.filter((one) => one.status === "past").sort((a, b) => b.endsAt.localeCompare(a.endsAt)),
  };
}

/**
 * The Announcement showing at `now`, if any: what a Member's Home shows. At
 * most one row can match, by the exclusion constraint.
 */
export async function runningAnnouncement(deps: Pick<Deps, "db" | "files">, now: Date): Promise<Announcement | undefined> {
  const { rows } = await deps.db.query<AnnouncementRow>(`${SELECT} where a.starts_at <= $1 and a.ends_at > $1`, [now]);
  const row = rows[0];
  return row === undefined ? undefined : toAnnouncement(row, deps.files, now);
}

async function findAnnouncement(db: Database | Tx, id: string, lock: boolean): Promise<AnnouncementRow | undefined> {
  const { rows } = await db.query<AnnouncementRow>(`${SELECT} where a.id = $1${lock ? " for update of a" : ""}`, [id]);
  return rows[0];
}

/** The refusal for a time range that overlaps another Announcement (not `exceptId`), naming the earliest one in the way. */
async function overlapRefusal(db: Database, startsAt: Date, endsAt: Date, exceptId: string | null): Promise<AppError | undefined> {
  const { rows } = await db.query<{ title: string; starts_at: Date; ends_at: Date }>(
    `select title, starts_at, ends_at from public.announcements
      where tstzrange(starts_at, ends_at, '[)') && tstzrange($1, $2, '[)')
        and ($3::uuid is null or id <> $3)
      order by starts_at limit 1`,
    [startsAt, endsAt, exceptId],
  );
  const other = rows[0];
  if (other === undefined) return undefined;
  return new AppError(
    409,
    "announcement_overlap",
    announcementOverlapMessage({ title: other.title, firstDay: libraryDayOf(other.starts_at), lastDay: lastDayOf(other) }),
  );
}

/** Turns the database's refusals of a write into the Librarian's: an overlap (named) or a Book that is gone. */
async function refusalOf(db: Database, error: unknown, startsAt: Date, endsAt: Date, exceptId: string | null): Promise<unknown> {
  const code = (error as { code?: unknown } | null)?.code;
  if (code === EXCLUSION_VIOLATION) {
    return (await overlapRefusal(db, startsAt, endsAt, exceptId)) ?? new AppError(409, "announcement_overlap", ANNOUNCEMENT_MESSAGES.overlapGone);
  }
  if (code === FOREIGN_KEY_VIOLATION && (error as { constraint?: unknown }).constraint === "announcements_link_book_id_fkey") {
    return refusals.bookNotFound();
  }
  return error;
}

async function checkBook(db: Database, details: ParsedAnnouncementDetails): Promise<void> {
  if (details.link.kind !== "book") return;
  const { rowCount } = await db.query("select 1 from public.books where id = $1", [details.link.bookId]);
  if (rowCount === 0) throw refusals.bookNotFound();
}

function rangeOf(details: ParsedAnnouncementDetails): { startsAt: Date; endsAt: Date } {
  return { startsAt: libraryDayStart(details.firstDay), endsAt: libraryDayStart(nextLibraryDay(details.lastDay)) };
}

function linkColumns(details: ParsedAnnouncementDetails): { bookId: string | null; url: string | null } {
  if (details.link.kind === "book") return { bookId: details.link.bookId, url: null };
  if (details.link.kind === "web") return { bookId: null, url: details.link.url };
  return { bookId: null, url: null };
}

/** What the audit log keeps of the link: its kind, and the Book or address a Member is sent to. */
function auditLink(details: ParsedAnnouncementDetails): { link: "none" | "book" | "web"; linkTarget: string | null } {
  const { bookId, url } = linkColumns(details);
  return { link: details.link.kind, linkTarget: bookId ?? url };
}

/** Stores files, all or none: when one fails, the others are removed and a storage refusal is thrown. */
async function storeFiles(deps: Deps, files: readonly { path: string; bytes: Buffer }[]): Promise<void> {
  const results = await Promise.allSettled(files.map((file) => deps.files.put(file.path, file.bytes, "image/jpeg")));
  const failed = results.find((result) => result.status === "rejected");
  if (failed === undefined) return;
  await removeFiles(
    deps,
    files.filter((_, index) => results[index]?.status === "fulfilled").map((file) => file.path),
  );
  throw refusals.storage(failed.reason);
}

/** Removes files the database no longer names. Never throws: a file left behind is only unused space. */
async function removeFiles(deps: Deps, paths: readonly string[]): Promise<void> {
  if (paths.length === 0) return;
  try {
    await deps.files.remove(paths);
  } catch (error) {
    deps.logger.error(`Could not remove unused Announcement files ${paths.join(", ")}`, error);
  }
}

/** A new name for a file of Announcement `id`. */
const newPath = (id: string) => `${id}/${randomUUID()}.jpg`;

/** Creates an Announcement with its poster. The Librarian is in the audit log. */
export async function createAnnouncement(deps: Deps, librarian: Identity, details: ParsedAnnouncementDetails, upload: Uint8Array | undefined): Promise<Announcement> {
  const now = deps.clock.now();
  if (details.firstDay < libraryDayOf(now)) throw refusals.invalid(ANNOUNCEMENT_MESSAGES.firstDayPast);
  const { startsAt, endsAt } = rangeOf(details);
  await checkBook(deps.db, details);
  const overlap = await overlapRefusal(deps.db, startsAt, endsAt, null);
  if (overlap) throw overlap;

  const prepared = await preparePoster(upload, details.cropPosition);
  const id = randomUUID();
  const posterPath = newPath(id);
  const bannerPath = newPath(id);
  await storeFiles(deps, [
    { path: posterPath, bytes: prepared.poster },
    { path: bannerPath, bytes: prepared.banner },
  ]);

  const link = linkColumns(details);
  try {
    await withTransaction(deps.db, async (tx) => {
      await tx.query(
        `insert into public.announcements
           (id, title, body, link_book_id, link_url, starts_at, ends_at, poster_path, banner_path,
            poster_width, poster_height, crop_position, created_by, created_at, updated_by, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $13, $14)`,
        [id, details.title, details.body, link.bookId, link.url, startsAt, endsAt, posterPath, bannerPath, prepared.posterWidth, prepared.posterHeight, details.cropPosition, librarian.userId, now],
      );
      // Last in the transaction, so a failed write leaves nothing in the audit log.
      await createAuditLog(deps).record(
        {
          type: "announcement_created",
          actorId: librarian.userId,
          subject: id,
          data: { title: details.title, firstDay: details.firstDay, lastDay: details.lastDay, ...auditLink(details) },
        },
        tx,
      );
    });
  } catch (error) {
    await removeFiles(deps, [posterPath, bannerPath]);
    throw await refusalOf(deps.db, error, startsAt, endsAt, null);
  }
  return toAnnouncement((await findAnnouncement(deps.db, id, false)) as AnnouncementRow, deps.files, deps.clock.now());
}

/**
 * Edits a running or scheduled Announcement: every field, and the poster when
 * `upload` is given. A new crop with no new poster cuts a new banner from the
 * stored poster. A past one is read-only.
 */
export async function editAnnouncement(
  deps: Deps,
  librarian: Identity,
  id: string,
  details: ParsedAnnouncementDetails,
  upload: Uint8Array | undefined,
): Promise<Announcement> {
  const now = deps.clock.now();
  const current = await findAnnouncement(deps.db, id, false);
  if (current === undefined) throw refusals.notFound();
  if (statusAt(current, now) === "past") throw refusals.past();
  const today = libraryDayOf(now);
  // A running one keeps its first day, which is behind it; no other day in the past will do.
  if (details.firstDay < today && details.firstDay !== libraryDayOf(current.starts_at)) throw refusals.invalid(ANNOUNCEMENT_MESSAGES.firstDayPast);
  if (details.lastDay < today) throw refusals.invalid(ANNOUNCEMENT_MESSAGES.lastDayPast);
  const { startsAt, endsAt } = rangeOf(details);
  await checkBook(deps.db, details);
  const overlap = await overlapRefusal(deps.db, startsAt, endsAt, id);
  if (overlap) throw overlap;

  // The images the row will name: new ones for a new poster or a new crop, the stored ones otherwise.
  const image = { posterPath: current.poster_path, bannerPath: current.banner_path, width: current.poster_width, height: current.poster_height };
  const stored: { path: string; bytes: Buffer }[] = [];
  if (upload !== undefined) {
    const prepared = await preparePoster(upload, details.cropPosition);
    Object.assign(image, { posterPath: newPath(id), bannerPath: newPath(id), width: prepared.posterWidth, height: prepared.posterHeight });
    stored.push({ path: image.posterPath, bytes: prepared.poster }, { path: image.bannerPath, bytes: prepared.banner });
  } else if (details.cropPosition !== current.crop_position) {
    let poster: Buffer;
    try {
      poster = await deps.files.get(current.poster_path);
    } catch (error) {
      throw refusals.storage(error);
    }
    image.bannerPath = newPath(id);
    stored.push({ path: image.bannerPath, bytes: await cutBanner(poster, current.poster_width, current.poster_height, details.cropPosition) });
  }
  await storeFiles(deps, stored);

  const link = linkColumns(details);
  try {
    await withTransaction(deps.db, async (tx) => {
      // Locked and read again: it may have been ended, deleted or changed since the checks above.
      const locked = await findAnnouncement(tx, id, true);
      if (locked === undefined) throw refusals.notFound();
      if (statusAt(locked, now) === "past") throw refusals.past();
      // Another desk saved it in between: this edit was made on what it saw before, so it is refused.
      if (locked.updated_at.getTime() !== current.updated_at.getTime()) throw refusals.changedElsewhere();
      await tx.query(
        `update public.announcements
            set title = $2, body = $3, link_book_id = $4, link_url = $5, starts_at = $6, ends_at = $7,
                poster_path = $8, banner_path = $9, poster_width = $10, poster_height = $11, crop_position = $12,
                updated_by = $13, updated_at = $14
          where id = $1`,
        [id, details.title, details.body, link.bookId, link.url, startsAt, endsAt, image.posterPath, image.bannerPath, image.width, image.height, details.cropPosition, librarian.userId, now],
      );
      await createAuditLog(deps).record(
        {
          type: "announcement_edited",
          actorId: librarian.userId,
          subject: id,
          data: { title: details.title, firstDay: details.firstDay, lastDay: details.lastDay, ...auditLink(details), imageReplaced: upload !== undefined },
        },
        tx,
      );
    });
  } catch (error) {
    await removeFiles(
      deps,
      stored.map((file) => file.path),
    );
    throw await refusalOf(deps.db, error, startsAt, endsAt, id);
  }
  const updated = (await findAnnouncement(deps.db, id, false)) as AnnouncementRow;
  // The files the row stopped naming.
  await removeFiles(
    deps,
    [current.poster_path, current.banner_path].filter((path) => path !== updated.poster_path && path !== updated.banner_path),
  );
  return toAnnouncement(updated, deps.files, deps.clock.now());
}

/** Ends the running Announcement now: its end moves to this moment, and it is past from then on. */
export async function endAnnouncement(deps: Deps, librarian: Identity, id: string): Promise<Announcement> {
  const now = deps.clock.now();
  await withTransaction(deps.db, async (tx) => {
    const row = await findAnnouncement(tx, id, true);
    if (row === undefined) throw refusals.notFound();
    const status = statusAt(row, now);
    if (status === "past") throw refusals.past();
    if (status === "scheduled") throw refusals.notRunning();
    await tx.query("update public.announcements set ends_at = $2, updated_by = $3, updated_at = $2 where id = $1", [id, now, librarian.userId]);
    await createAuditLog(deps).record(
      {
        type: "announcement_ended",
        actorId: librarian.userId,
        subject: id,
        data: { title: row.title, endsAt: now.toISOString(), plannedLastDay: lastDayOf(row) },
      },
      tx,
    );
  });
  return toAnnouncement((await findAnnouncement(deps.db, id, false)) as AnnouncementRow, deps.files, now);
}

/** Deletes a scheduled Announcement that has not started, with its images. */
export async function deleteAnnouncement(deps: Deps, librarian: Identity, id: string): Promise<void> {
  const now = deps.clock.now();
  const deleted = await withTransaction(deps.db, async (tx) => {
    const row = await findAnnouncement(tx, id, true);
    if (row === undefined) throw refusals.notFound();
    const status = statusAt(row, now);
    if (status === "past") throw refusals.past();
    if (status === "running") throw refusals.notScheduled();
    await tx.query("delete from public.announcements where id = $1", [id]);
    await createAuditLog(deps).record(
      {
        type: "announcement_deleted",
        actorId: librarian.userId,
        subject: id,
        data: { title: row.title, firstDay: libraryDayOf(row.starts_at), lastDay: lastDayOf(row) },
      },
      tx,
    );
    return row;
  });
  await removeFiles(deps, [deleted.poster_path, deleted.banner_path]);
}
