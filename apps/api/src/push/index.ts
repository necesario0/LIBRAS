import type { PushKind, PushSettings, PushSettingsChange } from "@libras/shared";
import type { AppDeps } from "../app.ts";
import type { Database, Tx } from "../db.ts";
import { PUSH_BATCH_SIZE, RECEIPT_BATCH_SIZE } from "./sender.ts";
import type { PushMessage } from "./sender.ts";

/**
 * Push notifications (GLOSSARY: Push notification): the phones of a Member, the
 * switches of each kind, and sending. Every event is pushed at most once per
 * Member (`push_sends`), to every phone of a Member who has its kind switched
 * on. Nothing here ever throws to the caller: a push is extra, and a failed one
 * must never stop the email or the action that caused it.
 */

export type PushDeps = Pick<AppDeps, "db" | "clock" | "logger" | "push">;

/** Each kind's column in `push_settings` and its value of the `push_kind` enum. */
const KIND_COLUMNS = {
  holdReady: "hold_ready",
  loanDueTomorrow: "loan_due_tomorrow",
  loanOverdue: "loan_overdue",
  announcement: "announcement",
} as const satisfies Record<PushKind, string>;

const SETTINGS_SELECT = `hold_ready as "holdReady", loan_due_tomorrow as "loanDueTomorrow", loan_overdue as "loanOverdue", announcement`;

/** How many phones of one Member get push notifications: a phone signed in later replaces the oldest beyond this. */
export const MAX_PUSH_DEVICES = 10;

/** How long after a send its receipt is read: Expo has it within about 15 minutes, and keeps it for a day. */
const RECEIPT_DELAY_MS = 15 * 60_000;
const RECEIPT_KEPT_MS = 24 * 60 * 60_000;

/** The Member's switches. Every Member has a row (a trigger adds it with the Member). */
export async function pushSettingsOf(db: Database | Tx, memberId: string): Promise<PushSettings> {
  const { rows } = await db.query<PushSettings>(`select ${SETTINGS_SELECT} from public.push_settings where member_id = $1`, [memberId]);
  const settings = rows[0];
  if (!settings) throw new Error(`Member ${memberId} has no push settings`);
  return settings;
}

/** Changes the named switches and keeps the others. Returns them all. */
export async function changePushSettings(db: Database, memberId: string, change: PushSettingsChange): Promise<PushSettings> {
  const entries = Object.entries(change) as [PushKind, boolean][];
  const assignments = entries.map(([kind], index) => `${KIND_COLUMNS[kind]} = $${index + 2}`);
  const { rows } = await db.query<PushSettings>(
    `update public.push_settings set ${assignments.join(", ")} where member_id = $1 returning ${SETTINGS_SELECT}`,
    [memberId, ...entries.map(([, on]) => on)],
  );
  const settings = rows[0];
  if (!settings) throw new Error(`Member ${memberId} has no push settings`);
  return settings;
}

/**
 * Records that this phone gets the Member's push notifications. A token another
 * Member had moves to this one (one phone, one signed-in Member). A Member keeps
 * their `MAX_PUSH_DEVICES` newest phones.
 */
export async function registerPushDevice(deps: Pick<AppDeps, "db" | "clock">, memberId: string, token: string): Promise<void> {
  await deps.db.query(
    `insert into public.push_devices (token, member_id, registered_at) values ($1, $2, $3)
     on conflict (token) do update set member_id = excluded.member_id, registered_at = excluded.registered_at`,
    [token, memberId, deps.clock.now()],
  );
  await deps.db.query(
    `delete from public.push_devices
      where member_id = $1
        and token not in (select token from public.push_devices where member_id = $1 order by registered_at desc, token limit $2)`,
    [memberId, MAX_PUSH_DEVICES],
  );
}

/** The phone stops getting push notifications: it signed out. */
export async function forgetPushDevice(db: Database | Tx, token: string): Promise<void> {
  await db.query("delete from public.push_devices where token = $1", [token]);
}

/** Every phone of the Member stops getting push notifications: Sign out of all devices, Delete my account. */
export async function forgetPushDevicesOf(db: Database | Tx, memberId: string): Promise<void> {
  await db.query("delete from public.push_devices where member_id = $1", [memberId]);
}

/** One event to push: its kind, the Member, and what names it within its kind (a Hold's id, say). */
export interface PushEvent {
  memberId: string;
  kind: PushKind;
  occasion: string;
}

/**
 * Claims events for pushing: for each Member who has the kind switched on and
 * at least one phone, records the event unless it is already recorded. Returns
 * the events claimed now; only those are pushed. The record comes first, so a
 * second sweep, or a second call for the same event, never pushes it again.
 */
async function claim(deps: PushDeps, kind: PushKind, events: readonly { memberId: string; occasion: string }[]): Promise<PushEvent[]> {
  if (events.length === 0) return [];
  const { rows } = await deps.db.query<{ member_id: string; occasion: string }>(
    `insert into public.push_sends (member_id, kind, occasion, sent_at)
     select e.member_id, $1::text::public.push_kind, e.occasion, $4
       from unnest($2::uuid[], $3::text[]) as e (member_id, occasion)
       join public.push_settings s on s.member_id = e.member_id and s.${KIND_COLUMNS[kind]}
      where exists (select 1 from public.push_devices d where d.member_id = e.member_id)
     on conflict do nothing
     returning member_id, occasion`,
    [KIND_COLUMNS[kind], events.map((event) => event.memberId), events.map((event) => event.occasion), deps.clock.now()],
  );
  return rows.map((row) => ({ memberId: row.member_id, kind, occasion: row.occasion }));
}

/** The phones of these Members. */
async function tokensOf(db: Database, memberIds: readonly string[]): Promise<Map<string, string[]>> {
  const { rows } = await db.query<{ member_id: string; token: string }>(
    "select member_id, token from public.push_devices where member_id = any($1::uuid[]) order by member_id, registered_at",
    [memberIds],
  );
  const tokens = new Map<string, string[]>();
  for (const row of rows) tokens.set(row.member_id, [...(tokens.get(row.member_id) ?? []), row.token]);
  return tokens;
}

/**
 * Sends the messages in batches. A token the service calls no longer registered
 * is forgotten; an accepted message's ticket is kept for its receipt. A batch
 * that fails is logged and the others still go.
 */
async function deliver(deps: PushDeps, messages: readonly PushMessage[]): Promise<number> {
  let accepted = 0;
  for (let start = 0; start < messages.length; start += PUSH_BATCH_SIZE) {
    const batch = messages.slice(start, start + PUSH_BATCH_SIZE);
    try {
      const tickets = await deps.push.send(batch);
      for (const [index, ticket] of tickets.entries()) {
        const token = batch[index]?.to;
        if (token === undefined) continue;
        if (ticket.status === "ok") {
          accepted += 1;
          await deps.db.query("insert into public.push_tickets (id, token, sent_at) values ($1, $2, $3) on conflict do nothing", [
            ticket.id,
            token,
            deps.clock.now(),
          ]);
        } else if (ticket.status === "invalid_token") {
          await forgetPushDevice(deps.db, token);
        } else {
          deps.logger.error(`A push notification was refused: ${ticket.message}`);
        }
      }
    } catch (error) {
      deps.logger.error(`${batch.length} push notifications could not be sent`, error);
    }
  }
  return accepted;
}

/** The words of one push notification. */
export interface PushContent {
  title: string;
  body: string;
}

/**
 * Pushes events of one kind, each to every phone of its Member, at most once
 * per Member and event. `content` words the push of one Member from the events
 * of theirs claimed now (a Member with two Loans due tomorrow gets one push
 * about both). Returns how many messages the service accepted. Never throws.
 */
export async function pushEvents(
  deps: PushDeps,
  kind: PushKind,
  events: readonly { memberId: string; occasion: string }[],
  content: (claimed: readonly PushEvent[]) => PushContent,
): Promise<number> {
  try {
    const claimed = await claim(deps, kind, events);
    if (claimed.length === 0) return 0;
    const byMember = new Map<string, PushEvent[]>();
    for (const event of claimed) byMember.set(event.memberId, [...(byMember.get(event.memberId) ?? []), event]);
    const tokens = await tokensOf(deps.db, [...byMember.keys()]);
    const messages: PushMessage[] = [];
    for (const [memberId, own] of byMember) {
      const words = content(own);
      for (const token of tokens.get(memberId) ?? []) messages.push({ to: token, ...words, data: { kind } });
    }
    return await deliver(deps, messages);
  } catch (error) {
    deps.logger.error(`The "${kind}" push notifications could not be sent`, error);
    return 0;
  }
}

/**
 * The sweep's push receipt job: reads the receipts of tickets sent at least 15
 * minutes ago and forgets every token a receipt calls no longer registered.
 * Tickets with a receipt, and those older than a day (Expo keeps receipts for
 * a day), are dropped. Returns how many tokens were forgotten.
 */
export async function checkPushReceipts(deps: PushDeps): Promise<number> {
  const now = deps.clock.now().getTime();
  await deps.db.query("delete from public.push_tickets where sent_at < $1", [new Date(now - RECEIPT_KEPT_MS)]);
  const { rows } = await deps.db.query<{ id: string; token: string }>(
    "select id, token from public.push_tickets where sent_at <= $1 order by sent_at, id limit $2",
    [new Date(now - RECEIPT_DELAY_MS), RECEIPT_BATCH_SIZE],
  );
  if (rows.length === 0) return 0;
  const receipts = await deps.push.receipts(rows.map((row) => row.id));
  let forgotten = 0;
  for (const row of rows) {
    if (receipts.get(row.id) !== "invalid_token") continue;
    await forgetPushDevice(deps.db, row.token);
    forgotten += 1;
  }
  await deps.db.query("delete from public.push_tickets where id = any($1::text[])", [[...receipts.keys()]]);
  return forgotten;
}

/**
 * The sweep's Announcement job: pushes the running Announcement, once, to every
 * Member who has Announcements switched on and a phone. It runs on every tick,
 * so an Announcement scheduled ahead is pushed within a tick of its start, and a
 * Member who switches Announcements on while one runs hears about that one too.
 * Returns how many messages the service accepted.
 */
export async function pushRunningAnnouncement(deps: PushDeps): Promise<number> {
  const now = deps.clock.now();
  const { rows } = await deps.db.query<{ id: string; title: string }>(
    "select id, title from public.announcements where starts_at <= $1 and ends_at > $1",
    [now],
  );
  const announcement = rows[0];
  if (!announcement) return 0;
  const members = await deps.db.query<{ member_id: string }>(
    `select s.member_id from public.push_settings s
      where s.announcement
        and exists (select 1 from public.push_devices d where d.member_id = s.member_id)
        and not exists (select 1 from public.push_sends p
                         where p.member_id = s.member_id and p.kind = 'announcement' and p.occasion = $1)`,
    [announcement.id],
  );
  return pushEvents(
    deps,
    "announcement",
    members.rows.map((row) => ({ memberId: row.member_id, occasion: announcement.id })),
    () => ({ title: "New from the library", body: announcement.title }),
  );
}
