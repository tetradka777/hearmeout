import type { StatsCalendarDay } from './types';
import type { WeekStart } from './palettes';

// Conventional weeks run left to right. Missing source dates stay empty;
// they must never be presented as zero listening or future days.
export function calendarMonths(days: StatsCalendarDay[], weekStart: WeekStart) {
  const groups = new Map<string, StatsCalendarDay[]>();
  for (const day of days) {
    const key = day.date.slice(0, 7);
    groups.set(key, [...(groups.get(key) ?? []), day]);
  }
  return [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([key, entries]) => {
    const [year, month] = key.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, 1));
    const leading = weekStart === 'mon' ? (date.getUTCDay() + 6) % 7 : date.getUTCDay();
    const length = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const cells: (StatsCalendarDay | null)[] = Array(Math.ceil((leading + length) / 7) * 7).fill(null);
    for (const day of entries) cells[leading + Number(day.date.slice(8)) - 1] = day;
    return { key, date, cells };
  });
}
