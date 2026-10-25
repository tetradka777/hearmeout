// A rating streak: how many days in a row, ending today or yesterday, the
// person rated at least one album, in their own time zone (tzOffset = the
// browser's getTimezoneOffset(), minutes). ratedToday: today already counts.
export function ratingStreak(dates: string[], tzOffset: number, now = Date.now()): { days: number; ratedToday: boolean } {
  const dayOf = (ms: number) => Math.floor((ms - tzOffset * 60000) / 86400000);
  const days = new Set(dates.map((d) => dayOf(Date.parse(d))).filter((d) => Number.isFinite(d)));
  const today = dayOf(now);
  const ratedToday = days.has(today);
  let d = ratedToday ? today : today - 1;
  let n = 0;
  while (days.has(d)) { n++; d--; }
  return { days: n, ratedToday };
}
