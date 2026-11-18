import { LIBRARY_UTC_OFFSET_HOURS } from "@libras/shared";

/**
 * When each Loan notice is due (ADR 0009). Every due date is the last
 * millisecond of a library day (`loanDueAt`), so notices are a matter of
 * library days:
 *
 * - due tomorrow: from 08:00 on the day before the due date, while the Loan is
 *   not overdue;
 * - now overdue: from 08:00 on the first overdue day, for 7 days;
 * - still overdue, repeat 1 to 4: from 08:00 every 7 days after that, each for
 *   7 days.
 *
 * Only the notice whose time has come and whose successor's has not is due,
 * so a notice that is out of date is skipped, never sent late: a due-tomorrow
 * notice once the Loan is overdue, a week's repeat once the next week's is due.
 * A missed repeat is therefore sent once, not once for each week missed.
 */

export type LoanNoticeKind = "due_tomorrow" | "now_overdue" | "still_overdue";

/** One notice of one Loan: the kind and, for still overdue, which repeat (1 to 4; 0 otherwise). */
export interface LoanNoticeSlot {
  kind: LoanNoticeKind;
  repeat: number;
}

/** Notices go out from this hour of the library day. */
export const NOTICE_HOUR = 8;
/** Days between the overdue notices. */
export const STILL_OVERDUE_EVERY_DAYS = 7;
/** How many still-overdue notices follow the now-overdue one. */
export const STILL_OVERDUE_REPEATS = 4;

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const OFFSET_MS = LIBRARY_UTC_OFFSET_HOURS * HOUR_MS;

/** The library day of a moment, as a count of days since 1 Jan 1970 in library time. */
export function libraryDayOf(moment: Date): number {
  return Math.floor((moment.getTime() + OFFSET_MS) / DAY_MS);
}

/** The library day as an ISO date, "2026-11-18". */
export function libraryDate(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

/** The moment `hour`:00 of a library day. */
function atHour(day: number, hour: number): number {
  return day * DAY_MS - OFFSET_MS + hour * HOUR_MS;
}

/** The notice a Loan that is still out, due at `dueAt`, should have had sent by `now`, or null when none is due. */
export function noticeDue(dueAt: Date, now: Date): LoanNoticeSlot | null {
  const dueDay = libraryDayOf(dueAt);
  const time = now.getTime();
  if (time <= dueAt.getTime()) {
    return time >= atHour(dueDay - 1, NOTICE_HOUR) ? { kind: "due_tomorrow", repeat: 0 } : null;
  }
  const sinceFirstOverdue = time - atHour(dueDay + 1, NOTICE_HOUR);
  if (sinceFirstOverdue < 0) return null;
  const week = Math.floor(sinceFirstOverdue / (STILL_OVERDUE_EVERY_DAYS * DAY_MS));
  if (week > STILL_OVERDUE_REPEATS) return null;
  return week === 0 ? { kind: "now_overdue", repeat: 0 } : { kind: "still_overdue", repeat: week };
}

/**
 * The due dates that can have a notice due at `now`: a Loan due later than
 * `latest` is not yet a day from its due date, one due before `earliest` is past
 * its last repeat. Generous by a day each way; `noticeDue` decides.
 */
export function noticeWindow(now: Date): { earliest: Date; latest: Date } {
  const lastNoticeDays = 1 + STILL_OVERDUE_EVERY_DAYS * (STILL_OVERDUE_REPEATS + 1) + 1;
  return { earliest: new Date(now.getTime() - lastNoticeDays * DAY_MS), latest: new Date(now.getTime() + 2 * DAY_MS) };
}
