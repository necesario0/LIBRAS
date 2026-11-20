import { NOTIFICATIONS_PAGE_SIZE, NOTIFICATION_MESSAGES } from "@libras/shared";
import type { MemberNotification, MyNotificationsResponse, NotificationKind } from "@libras/shared";
import { z } from "zod";
import type { AppDeps } from "../app.ts";
import type { Identity } from "../auth/auth-provider.ts";
import { withIdentity } from "../auth/identity.ts";
import type { IdentityScope } from "../auth/identity.ts";
import type { Database, Tx } from "../db.ts";
import { AppError } from "../errors.ts";

/**
 * Notifications (GLOSSARY: Notification): a Member's notification inbox.
 *
 * - A Hold ready, a Loan due tomorrow and a Loan now overdue are the Member's
 *   own: `recordNotifications` writes one row per Member and event when it
 *   happens (the unique key keeps a retried or concurrent sweep or dispatch
 *   from adding a second), whatever the push switches say.
 * - An Announcement reaches every Member, so it is not copied per Member: the
 *   Announcements themselves are the entries (each one that started, and was
 *   still running or yet to come when the Member joined), and
 *   `announcement_reads` keeps which ones the Member has read.
 *
 * Listing and marking run as the Member (`withIdentity`), so row-level security
 * keeps them to their own rows behind the API's own checks. Announcements are
 * the library's notices to every Member, read by the API as itself, as Home does.
 */

export type NotificationDeps = Pick<AppDeps, "db" | "clock" | "logger">;

/** The kinds stored as rows, and their value of the `notification_kind` enum. */
const STORED_KINDS = {
  holdReady: "hold_ready",
  loanDueTomorrow: "loan_due_tomorrow",
  loanOverdue: "loan_overdue",
} as const satisfies Partial<Record<NotificationKind, string>>;

export type StoredNotificationKind = keyof typeof STORED_KINDS;
type StoredKindValue = (typeof STORED_KINDS)[StoredNotificationKind];

const KIND_OF_VALUE: Record<StoredKindValue, StoredNotificationKind> = {
  hold_ready: "holdReady",
  loan_due_tomorrow: "loanDueTomorrow",
  loan_overdue: "loanOverdue",
};

/** What a stored Notification is about: the Hold of a Hold ready, the Loan of a Loan notice. */
export type StoredNotificationSubject = { holdId: string } | { loanId: string };

/** One Notification to record. `occasion` names the event within its kind, as `push_sends` does. */
export interface NewNotification {
  memberId: string;
  occasion: string;
  title: string;
  body: string;
  about: StoredNotificationSubject;
}

/**
 * Records Notifications of one kind, at most one per Member and event: an
 * event already recorded (a retried sweep, a second dispatch path) adds
 * nothing. A deleted Member gets none. Never throws: a Notification must never
 * stop the email, the push or the action that caused it, so a failure is
 * logged. Returns how many were added.
 */
export async function recordNotifications(deps: NotificationDeps, kind: StoredNotificationKind, entries: readonly NewNotification[]): Promise<number> {
  if (entries.length === 0) return 0;
  try {
    const result = await deps.db.query(
      `insert into public.notifications (member_id, kind, occasion, title, body, hold_id, loan_id, created_at)
       select e.member_id, $1::text::public.notification_kind, e.occasion, e.title, e.body, e.hold_id, e.loan_id, $8
         from unnest($2::uuid[], $3::text[], $4::text[], $5::text[], $6::uuid[], $7::uuid[])
                as e (member_id, occasion, title, body, hold_id, loan_id)
         join public.members m on m.user_id = e.member_id and m.deleted_at is null
       on conflict on constraint notifications_once do nothing`,
      [
        STORED_KINDS[kind],
        entries.map((entry) => entry.memberId),
        entries.map((entry) => entry.occasion),
        entries.map((entry) => entry.title),
        entries.map((entry) => entry.body),
        entries.map((entry) => ("holdId" in entry.about ? entry.about.holdId : null)),
        entries.map((entry) => ("loanId" in entry.about ? entry.about.loanId : null)),
        deps.clock.now(),
      ],
    );
    return result.rowCount ?? 0;
  } catch (error) {
    deps.logger.error(`The "${kind}" Notifications could not be recorded`, error);
    return 0;
  }
}

/** Every Notification and Announcement read mark of the Member goes: Delete my account. */
export async function forgetNotificationsOf(tx: Tx, memberId: string): Promise<void> {
  await tx.query("delete from public.notifications where member_id = $1", [memberId]);
  await tx.query("delete from public.announcement_reads where member_id = $1", [memberId]);
}

/** Where a page of Notifications ends: the time and id of its last entry. Older entries come after it. */
interface Cursor {
  at: Date;
  id: string;
}

const cursorSchema = z.strictObject({ at: z.iso.datetime(), id: z.uuid() });

function encodeCursor(entry: Pick<MemberNotification, "at" | "id">): string {
  return Buffer.from(JSON.stringify({ at: entry.at, id: entry.id })).toString("base64url");
}

/** The cursor a client sent back, or a 400 when it is not one the API made. */
function decodeCursor(text: string): Cursor {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(text, "base64url").toString("utf8"));
  } catch {
    parsed = undefined;
  }
  const cursor = cursorSchema.safeParse(parsed);
  if (!cursor.success) throw new AppError(400, "invalid_request", NOTIFICATION_MESSAGES.invalidCursor);
  return { at: new Date(cursor.data.at), id: cursor.data.id };
}

/**
 * The Announcements that are entries of the Member's inbox: those that have
 * started (and really ran: one ended at the moment it started never showed),
 * and that were still running or yet to come when the Member joined.
 */
const MEMBER_ANNOUNCEMENTS = `
  from public.announcements a
  join public.members m on m.user_id = $1
 where a.starts_at <= $2 and a.ends_at > a.starts_at and a.ends_at > m.created_at`;

interface AnnouncementEntryRow {
  id: string;
  title: string;
  starts_at: Date;
}

async function announcementEntries(db: Database, memberId: string, now: Date, before: Cursor | null, limit: number): Promise<AnnouncementEntryRow[]> {
  const { rows } = await db.query<AnnouncementEntryRow>(
    `select a.id, a.title, a.starts_at ${MEMBER_ANNOUNCEMENTS}
       and ($3::timestamptz is null or (a.starts_at, a.id) < ($3::timestamptz, $4::uuid))
     order by a.starts_at desc, a.id desc
     limit $5`,
    [memberId, now, before?.at ?? null, before?.id ?? null, limit],
  );
  return rows;
}

/** The ids of every Announcement in the Member's inbox. */
async function announcementIds(db: Database, memberId: string, now: Date): Promise<string[]> {
  const { rows } = await db.query<{ id: string }>(`select a.id ${MEMBER_ANNOUNCEMENTS}`, [memberId, now]);
  return rows.map((row) => row.id);
}

interface NotificationRow {
  id: string;
  kind: StoredKindValue;
  title: string;
  body: string;
  created_at: Date;
  read: boolean;
  hold_id: string | null;
  loan_id: string | null;
}

function toMemberNotification(row: NotificationRow): MemberNotification {
  const about =
    row.hold_id !== null ? { kind: "hold" as const, holdId: row.hold_id } : row.loan_id !== null ? { kind: "loan" as const, loanId: row.loan_id } : null;
  if (about === null) throw new Error(`Notification ${row.id} is about nothing`);
  return { id: row.id, kind: KIND_OF_VALUE[row.kind], title: row.title, body: row.body, at: row.created_at.toISOString(), read: row.read, about };
}

/** The title of an Announcement's entry, as its push notification has it. Its line is the Announcement's own title. */
export const ANNOUNCEMENT_NOTIFICATION_TITLE = "New from the library";

/** Plain code-unit order: ISO 8601 times and lowercase uuids sort as PostgreSQL sorts them. */
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Newest first, then by id, as both queries order them. */
const newestFirst = (a: MemberNotification, b: MemberNotification) => compare(b.at, a.at) || compare(b.id, a.id);

/** How many of the Member's Notifications are unread: their own rows, and the Announcements they have not read. */
async function countUnread(scope: IdentityScope, memberId: string, announcements: readonly string[]): Promise<number> {
  const { rows } = await scope.query<{ unread: number }>(
    `select ((select count(*) from public.notifications where member_id = $1 and read_at is null)
             + cardinality($2::uuid[])
             - (select count(*) from public.announcement_reads where member_id = $1 and announcement_id = any($2::uuid[])))::int as unread`,
    [memberId, announcements],
  );
  return rows[0]?.unread ?? 0;
}

/**
 * A page of the Member's Notifications, newest first: `NOTIFICATIONS_PAGE_SIZE`
 * of them, older than `before` (a `nextCursor` of an earlier page) when given,
 * with the unread count of all of them.
 */
export async function listNotifications(deps: NotificationDeps, identity: Identity, before: string | undefined): Promise<MyNotificationsResponse> {
  const now = deps.clock.now();
  const cursor = before === undefined ? null : decodeCursor(before);
  const memberId = identity.userId;
  // One more than a page from each source tells whether an older page exists.
  const announcements = await announcementEntries(deps.db, memberId, now, cursor, NOTIFICATIONS_PAGE_SIZE + 1);
  const allAnnouncements = await announcementIds(deps.db, memberId, now);

  const { own, readAnnouncements, unread } = await withIdentity(deps.db, identity, async (scope) => {
    const rows = await scope.query<NotificationRow>(
      `select id, kind::text as kind, title, body, created_at, read_at is not null as read, hold_id, loan_id
         from public.notifications
        where member_id = $1 and ($2::timestamptz is null or (created_at, id) < ($2::timestamptz, $3::uuid))
        order by created_at desc, id desc
        limit $4`,
      [memberId, cursor?.at ?? null, cursor?.id ?? null, NOTIFICATIONS_PAGE_SIZE + 1],
    );
    const reads = await scope.query<{ announcement_id: string }>(
      "select announcement_id from public.announcement_reads where member_id = $1 and announcement_id = any($2::uuid[])",
      [memberId, announcements.map((row) => row.id)],
    );
    return {
      own: rows.rows,
      readAnnouncements: new Set(reads.rows.map((row) => row.announcement_id)),
      unread: await countUnread(scope, memberId, allAnnouncements),
    };
  });

  const merged = [
    ...own.map(toMemberNotification),
    ...announcements.map(
      (row): MemberNotification => ({
        id: row.id,
        kind: "announcement",
        title: ANNOUNCEMENT_NOTIFICATION_TITLE,
        body: row.title,
        at: row.starts_at.toISOString(),
        read: readAnnouncements.has(row.id),
        about: { kind: "announcement", announcementId: row.id },
      }),
    ),
  ].sort(newestFirst);
  const page = merged.slice(0, NOTIFICATIONS_PAGE_SIZE);
  const last = page.at(-1);
  return { notifications: page, nextCursor: merged.length > NOTIFICATIONS_PAGE_SIZE && last ? encodeCursor(last) : null, unread };
}

/** How many of the Member's Notifications are unread. */
export async function unreadNotifications(deps: NotificationDeps, identity: Identity): Promise<number> {
  const announcements = await announcementIds(deps.db, identity.userId, deps.clock.now());
  return withIdentity(deps.db, identity, (scope) => countUnread(scope, identity.userId, announcements));
}

/**
 * Marks one of the Member's Notifications read (again is harmless) and returns
 * the unread count. 404 when the Member has no Notification with that id:
 * another Member's is as unknown as one that never existed.
 */
export async function markNotificationRead(deps: NotificationDeps, identity: Identity, id: string): Promise<number> {
  const now = deps.clock.now();
  const memberId = identity.userId;
  const announcements = await announcementIds(deps.db, memberId, now);
  return withIdentity(deps.db, identity, async (scope) => {
    const own = await scope.query("update public.notifications set read_at = coalesce(read_at, $3) where id = $1 and member_id = $2", [id, memberId, now]);
    if (own.rowCount === 0) {
      if (!announcements.includes(id)) throw new AppError(404, "notification_not_found", NOTIFICATION_MESSAGES.notFound);
      await scope.query(
        "insert into public.announcement_reads (member_id, announcement_id, read_at) values ($1, $2, $3) on conflict do nothing",
        [memberId, id, now],
      );
    }
    return countUnread(scope, memberId, announcements);
  });
}

/** Marks every Notification of the Member read, and returns the unread count (none, unless one came in meanwhile). */
export async function markAllNotificationsRead(deps: NotificationDeps, identity: Identity): Promise<number> {
  const now = deps.clock.now();
  const memberId = identity.userId;
  const announcements = await announcementIds(deps.db, memberId, now);
  return withIdentity(deps.db, identity, async (scope) => {
    await scope.query("update public.notifications set read_at = $2 where member_id = $1 and read_at is null", [memberId, now]);
    await scope.query(
      `insert into public.announcement_reads (member_id, announcement_id, read_at)
       select $1, unnest($2::uuid[]), $3
       on conflict do nothing`,
      [memberId, announcements, now],
    );
    return countUnread(scope, memberId, announcements);
  });
}
