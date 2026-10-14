import type { SeasonName, SeasonOption } from './types';

const SEASONS: SeasonName[] = ['winter', 'spring', 'summer', 'autumn'];

// Meteorological (calendar-month) seasons, Northern-hemisphere convention.
// Winter spans two calendar years — labelled by the year its Jan/Feb falls
// in (e.g. "winter 2026" = 1 Dec 2025 through the end of Feb 2026), which
// matches how people actually say "this winter". `end` is EXCLUSIVE.
export function seasonBounds(year: number, season: SeasonName): { start: Date; end: Date } {
  if (season === 'winter') return { start: new Date(Date.UTC(year - 1, 11, 1)), end: new Date(Date.UTC(year, 2, 1)) };
  if (season === 'spring') return { start: new Date(Date.UTC(year, 2, 1)), end: new Date(Date.UTC(year, 5, 1)) };
  if (season === 'summer') return { start: new Date(Date.UTC(year, 5, 1)), end: new Date(Date.UTC(year, 8, 1)) };
  return { start: new Date(Date.UTC(year, 8, 1)), end: new Date(Date.UTC(year, 11, 1)) };
}

export function seasonKey(year: number, season: SeasonName): string {
  return `${year}-${season}`;
}

export function parseSeasonKey(key: string): { year: number; season: SeasonName } | null {
  const m = /^(\d{4})-(winter|spring|summer|autumn)$/.exec(key);
  if (!m) return null;
  return { year: Number(m[1]), season: m[2] as SeasonName };
}

// Every season key that overlaps [from, to], most recent first — used to
// build a real "which seasons actually have your data" picker instead of
// guessing a fixed list of years.
export function seasonsInRange(from: Date, to: Date): SeasonOption[] {
  const options: SeasonOption[] = [];
  const startYear = from.getUTCFullYear();
  const endYear = to.getUTCFullYear() + 1;
  for (let year = endYear; year >= startYear; year--) {
    for (const season of SEASONS) {
      const { start, end } = seasonBounds(year, season);
      if (start <= to && end > from) options.push({ key: seasonKey(year, season), year, season });
    }
  }
  return options.sort((a, b) => seasonBounds(b.year, b.season).start.getTime() - seasonBounds(a.year, a.season).start.getTime());
}

// The last `n` finished seasons before `now`, most recent first (recaps
// are made only for those: the last season and the one before).
export function lastSeasons(now: Date = new Date(), n = 2): SeasonOption[] {
  const out: SeasonOption[] = [];
  for (let year = now.getUTCFullYear() + 1; year >= now.getUTCFullYear() - 2 && out.length < n; year--) {
    for (const season of [...SEASONS].reverse()) {
      if (seasonBounds(year, season).end <= now) out.push({ key: seasonKey(year, season), year, season });
      if (out.length >= n) break;
    }
  }
  return out.sort((a, b) => seasonBounds(b.year, b.season).start.getTime() - seasonBounds(a.year, a.season).start.getTime()).slice(0, n);
}
