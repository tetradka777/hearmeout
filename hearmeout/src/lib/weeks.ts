import type { WeekStart } from './palettes';

// Weekly recap weeks (spec 6.12): the recap is for the last *completed*
// week, starting on the account's week-start day. offset 0 = that latest
// completed week, -1 the one before, and so on. Computed in UTC like the
// rest of the recap/stats windows, on *local* dates: `now` is the local
// time written as if it were UTC (localNow()), so the week turns over at
// the viewer's own Monday midnight. The server passes the viewer's.
export function completedWeekRange(offset: number, weekStart: WeekStart, now: Date = localNow()): { start: Date; end: Date } {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dow = today.getUTCDay(); // 0 = Sunday
  const sinceWeekStart = weekStart === 'mon' ? (dow + 6) % 7 : dow;
  const thisWeekStart = new Date(today.getTime() - sinceWeekStart * 86400000);
  const start = new Date(thisWeekStart.getTime() + (offset - 1) * 7 * 86400000);
  return { start, end: new Date(start.getTime() + 7 * 86400000) };
}

// This device's local time, written as if it were UTC (on a UTC server it's
// just now).
export function localNow(): Date {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000);
}

// ISO week number of the week that contains the range's Thursday — the
// label on the week chips ("Week 39 · latest").
export function isoWeekNumber(start: Date): number {
  const thursday = new Date(start.getTime());
  while (thursday.getUTCDay() !== 4) thursday.setUTCDate(thursday.getUTCDate() + 1);
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  return Math.ceil(((thursday.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}
