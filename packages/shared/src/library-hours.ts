/**
 * Library operating hours in Philippine Standard Time (UTC+8, no daylight saving).
 * Used for same-day in-library Loans (Visitors and Alumni) and kept in sync
 * with Settings > Library info.
 */

export const LIBRARY_UTC_OFFSET_HOURS = 8;

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const OFFSET_MS = LIBRARY_UTC_OFFSET_HOURS * HOUR_MS;

export interface DailySchedule {
  readonly openMinutes: number;
  readonly closeMinutes: number;
  readonly label: string;
}

/** Weekday (Mon-Fri) and Saturday schedules, in minutes after midnight (UTC+8). Sunday is closed (null). */
export const WEEKDAY_HOURS: DailySchedule = {
  openMinutes: 8 * 60,
  closeMinutes: 19 * 60,
  label: "8:00 AM to 7:00 PM",
};

export const SATURDAY_HOURS: DailySchedule = {
  openMinutes: 8 * 60,
  closeMinutes: 12 * 60,
  label: "8:00 AM to 12:00 PM",
};

export const LIBRARY_HOURS_SUMMARY = "Mon-Fri 8:00 AM - 7:00 PM, Sat 8:00 AM - 12:00 PM";

export interface LibraryHoursWindow {
  openAt: Date;
  closeAt: Date;
}

/**
 * Opening and closing timestamps (UTC Date instances) on the library's calendar
 * day containing `moment`, or `null` when the library is closed all day (Sunday).
 */
export function libraryHoursOn(moment: Date): LibraryHoursWindow | null {
  const shifted = new Date(moment.getTime() + OFFSET_MS);
  const dayOfWeek = shifted.getUTCDay();
  const schedule = dayOfWeek === 0 ? null : dayOfWeek === 6 ? SATURDAY_HOURS : WEEKDAY_HOURS;
  if (schedule === null) return null;

  const libraryDay = Math.floor((moment.getTime() + OFFSET_MS) / DAY_MS);
  const midnightMs = libraryDay * DAY_MS - OFFSET_MS;
  return {
    openAt: new Date(midnightMs + schedule.openMinutes * MINUTE_MS),
    closeAt: new Date(midnightMs + schedule.closeMinutes * MINUTE_MS),
  };
}

/** Whether `moment` falls within library operating hours (`openAt <= moment < closeAt`). */
export function isWithinLibraryHours(moment: Date): boolean {
  const hours = libraryHoursOn(moment);
  if (hours === null) return false;
  const time = moment.getTime();
  return time >= hours.openAt.getTime() && time < hours.closeAt.getTime();
}

/**
 * Closing time for a same-day in-library Loan checked out at `checkedOutAt`,
 * or `null` when the library is closed at `checkedOutAt`.
 */
export function inLibraryLoanDueAt(checkedOutAt: Date): Date | null {
  if (!isWithinLibraryHours(checkedOutAt)) return null;
  return libraryHoursOn(checkedOutAt)?.closeAt ?? null;
}
