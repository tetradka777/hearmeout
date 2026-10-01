import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUserId } from '@/lib/identity';
import { fetchAllRows } from '@/lib/supabasePaginate';
import { canViewProfileData } from '@/lib/userProfile';
import type { StatsCalendarDay, StatsData, StatsPeriodType, StatsSeasonChip, StatsSeasonKey } from '@/lib/types';
import type { WeekStart } from '@/lib/palettes';

type Row = { track_id: string | null; track_title: string | null; artist: string | null; artist_id: string | null; cover_url: string | null; genre: string | null; duration_ms: number | null; played_at: string };

const DAY_MS = 86400000;

function todayUTC(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
function addDaysUTC(d: Date, n: number): Date {
  return new Date(d.getTime() + n * DAY_MS);
}
function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function weekStartOffset(d: Date, weekStart: WeekStart): number {
  const dow = d.getUTCDay();
  return weekStart === 'mon' ? (dow + 6) % 7 : dow;
}

const SEASON_ORDER: StatsSeasonKey[] = ['winter', 'spring', 'summer', 'autumn', 'winterd'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function seasonBoundsInYear(year: number, season: StatsSeasonKey): { start: Date; end: Date } {
  if (season === 'winter') return { start: new Date(Date.UTC(year, 0, 1)), end: new Date(Date.UTC(year, 2, 1)) };
  if (season === 'spring') return { start: new Date(Date.UTC(year, 2, 1)), end: new Date(Date.UTC(year, 5, 1)) };
  if (season === 'summer') return { start: new Date(Date.UTC(year, 5, 1)), end: new Date(Date.UTC(year, 8, 1)) };
  if (season === 'autumn') return { start: new Date(Date.UTC(year, 8, 1)), end: new Date(Date.UTC(year, 11, 1)) };
  return { start: new Date(Date.UTC(year, 11, 1)), end: new Date(Date.UTC(year + 1, 0, 1)) }; // winterd (December)
}

// The started seasons of the current calendar year, oldest first — winter
// (Jan–Feb) and winterd (Dec) are two separate chips so winter never spans
// a year boundary here, unlike Recap's seasons.ts.
function seasonChipsForToday(today: Date): StatsSeasonChip[] {
  const year = today.getUTCFullYear();
  const chips: StatsSeasonChip[] = [];
  for (const key of SEASON_ORDER) {
    const { start, end } = seasonBoundsInYear(year, key);
    if (start > today) continue;
    const current = today >= start && today < end;
    const suffix = key === 'winter' ? ' · Jan–Feb' : key === 'winterd' ? ' · Dec' : '';
    const label = `${key === 'winterd' ? 'Winter' : key[0].toUpperCase() + key.slice(1)} ${year}${suffix}`;
    const sub = current ? 'current season · in progress' : 'complete';
    chips.push({ key, year, label, sub, current });
  }
  return chips;
}

type Range = { start: Date; end: Date; label: string; sub: string };

function weekRange(today: Date, offset: number, weekStart: WeekStart): Range {
  const thisWeekStart = addDaysUTC(today, -weekStartOffset(today, weekStart));
  const start = addDaysUTC(thisWeekStart, offset * 7);
  const end = addDaysUTC(start, 7);
  const last = addDaysUTC(end, -1);
  const label = `${MONTH_SHORT[start.getUTCMonth()]} ${start.getUTCDate()} – ${last.getUTCMonth() !== start.getUTCMonth() ? MONTH_SHORT[last.getUTCMonth()] + ' ' : ''}${last.getUTCDate()}`;
  const sub = offset === 0 ? 'this week' : offset === -1 ? 'last week' : 'earlier';
  return { start, end, label, sub };
}

function monthRange(today: Date, offset: number): Range {
  const base = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + offset, 1));
  const start = base;
  const end = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 1));
  const label = `${MONTH_LONG[start.getUTCMonth()]} ${start.getUTCFullYear()}`;
  const sub = offset === 0 ? 'this month' : offset === -1 ? 'last month' : 'earlier';
  return { start, end, label, sub };
}

function seasonRange(today: Date, seasonKeyParam: string | null, chips: StatsSeasonChip[]): Range & { seasonKey: StatsSeasonKey } {
  const found = chips.find((c) => c.key === seasonKeyParam) || chips[chips.length - 1];
  const { start, end } = seasonBoundsInYear(found.year, found.key);
  return { start, end, label: found.label, sub: found.sub, seasonKey: found.key };
}

export async function GET(request: NextRequest) {
  const viewerId = await getCurrentUserId();
  if (!viewerId) return NextResponse.json({ error: 'not_registered' }, { status: 401 });

  const url = new URL(request.url);
  const targetUserId = url.searchParams.get('userId') || viewerId;
  const weekStart: WeekStart = url.searchParams.get('weekStart') === 'sun' ? 'sun' : 'mon';

  const admin = supabaseAdmin();
  if (!(await canViewProfileData(admin, targetUserId, viewerId))) {
    return NextResponse.json({ error: 'not_friends' }, { status: 403 });
  }

  const today = todayUTC();
  const seasonChips = seasonChipsForToday(today);

  const periodParam = url.searchParams.get('period') as StatsPeriodType | null;
  const legacyRange = url.searchParams.get('range'); // back-compat: FriendScreen's comparison fetch
  const periodType: StatsPeriodType = periodParam === 'month' || periodParam === 'season' ? periodParam : periodParam === 'week' ? 'week' : 'week';
  const offset = Number(url.searchParams.get('offset') || 0) || 0;

  let range: Range;
  let seasonKey: StatsSeasonKey | null = null;
  let comparisonNote: StatsData['comparisonNote'] = 'normal';
  let prevRange: Range | null = null;

  if (legacyRange && !periodParam) {
    // Legacy 6-month window, used only by the friend-comparison chart —
    // not a selectable period in the redesigned Stats screen (spec 7.5).
    const start = addDaysUTC(today, -182);
    range = { start, end: addDaysUTC(today, 1), label: '', sub: '' };
  } else if (periodType === 'week') {
    range = weekRange(today, offset, weekStart);
    prevRange = weekRange(today, offset - 1, weekStart);
  } else if (periodType === 'month') {
    range = monthRange(today, offset);
    prevRange = monthRange(today, offset - 1);
  } else {
    const r = seasonRange(today, url.searchParams.get('season'), seasonChips);
    range = r;
    seasonKey = r.seasonKey;
    const idx = seasonChips.findIndex((c) => c.key === seasonKey);
    if (idx > 0) {
      const prev = seasonChips[idx - 1];
      const bounds = seasonBoundsInYear(prev.year, prev.key);
      prevRange = { start: bounds.start, end: bounds.end, label: prev.label, sub: prev.sub };
    } else {
      comparisonNote = 'first_season';
    }
  }

  // PostgREST caps every request at its project max-rows setting regardless
  // of .limit() — paginate with .range() to get the real full history
  // (needed for "new artist" and the previous-period comparison, both of
  // which look outside the selected window).
  const [{ rows: all, error }, { data: ratings }] = await Promise.all([
    fetchAllRows<Row>((from, to) =>
      admin
        .from('listening_events')
        .select('track_id, track_title, artist, artist_id, cover_url, genre, duration_ms, played_at')
        .eq('user_id', targetUserId)
        .order('played_at', { ascending: true })
        .range(from, to)
    ),
    admin.from('ratings').select('stars').eq('user_id', targetUserId),
  ]);
  if (error) return NextResponse.json({ error }, { status: 500 });

  const inRange = all.filter((r) => {
    const t = new Date(r.played_at).getTime();
    return t >= range.start.getTime() && t < range.end.getTime();
  });
  const artistKey = (r: Row) => r.artist_id || r.artist || '';

  const hours = Math.round((inRange.reduce((s, r) => s + (r.duration_ms || 0), 0) / 3600000) * 10) / 10;
  const trackCount = inRange.length;
  const artistCount = new Set(inRange.map(artistKey).filter(Boolean)).size;

  const firstSeen = new Map<string, number>();
  for (const r of all) {
    const k = artistKey(r);
    if (!k) continue;
    const t = new Date(r.played_at).getTime();
    if (!firstSeen.has(k) || t < firstSeen.get(k)!) firstSeen.set(k, t);
  }
  const newArtistCount = [...new Set(inRange.map(artistKey).filter(Boolean))].filter((k) => (firstSeen.get(k) ?? 0) >= range.start.getTime()).length;

  const ratingsList = ratings || [];
  const avgRating = ratingsList.length ? Math.round((ratingsList.reduce((s, r) => s + Number(r.stars), 0) / ratingsList.length) * 10) / 10 : 0;

  const hourCounts = new Array(24).fill(0) as number[];
  for (const r of inRange) hourCounts[new Date(r.played_at).getHours()]++;
  const peakHour = inRange.length ? hourCounts.indexOf(Math.max(...hourCounts)) : null;

  const artistAgg = new Map<string, { name: string; id: string | null; cover: string | null; ms: number; plays: number }>();
  for (const r of inRange) {
    const k = artistKey(r);
    if (!k || !r.artist) continue;
    const cur = artistAgg.get(k) || { name: r.artist, id: r.artist_id, cover: r.cover_url, ms: 0, plays: 0 };
    cur.ms += r.duration_ms || 0;
    cur.plays += 1;
    artistAgg.set(k, cur);
  }
  const topArtists = [...artistAgg.values()]
    .sort((a, b) => b.ms - a.ms)
    .slice(0, 10)
    .map((a) => ({ name: a.name, id: a.id, cover: a.cover, hours: Math.round((a.ms / 3600000) * 10) / 10, plays: a.plays }));

  const genreCounts = new Map<string, number>();
  for (const r of inRange) if (r.genre) genreCounts.set(r.genre, (genreCounts.get(r.genre) || 0) + 1);
  const totalGenre = [...genreCounts.values()].reduce((s, n) => s + n, 0);
  const genreSplit = [...genreCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([genre, n]) => ({ genre, pct: totalGenre ? Math.round((n / totalGenre) * 100) : 0 }));

  // Per-day aggregation for the calendar and the "hours per day/week" bars.
  const byDay = new Map<string, { ms: number; tracks: number; artistMs: Map<string, number> }>();
  for (const r of inRange) {
    const k = r.played_at.slice(0, 10);
    const cur = byDay.get(k) || { ms: 0, tracks: 0, artistMs: new Map<string, number>() };
    cur.ms += r.duration_ms || 0;
    cur.tracks += 1;
    if (r.artist) cur.artistMs.set(r.artist, (cur.artistMs.get(r.artist) || 0) + (r.duration_ms || 0));
    byDay.set(k, cur);
  }
  const days: StatsCalendarDay[] = [];
  let activeDays = 0;
  let totalDays = 0;
  let longestStreak = 0;
  let streak = 0;
  let bestDay: StatsData['calendar']['bestDay'] = null;
  for (let d = new Date(range.start); d < range.end; d = addDaysUTC(d, 1)) {
    const key = dayKey(d);
    const future = d > today;
    const agg = byDay.get(key);
    const minutes = agg ? Math.round(agg.ms / 60000) : 0;
    const tracks = agg ? agg.tracks : 0;
    let topArtist: string | null = null;
    if (agg && agg.artistMs.size) topArtist = [...agg.artistMs.entries()].sort((a, b) => b[1] - a[1])[0][0];
    days.push({ date: key, minutes, tracks, topArtist, future });
    if (!future) {
      totalDays++;
      if (minutes > 0) {
        activeDays++;
        streak++;
        if (streak > longestStreak) longestStreak = streak;
      } else streak = 0;
      if (!bestDay || minutes > bestDay.minutes) bestDay = { date: key, minutes, tracks, topArtist };
    }
  }

  const recentPlays = [...inRange]
    .sort((a, b) => new Date(b.played_at).getTime() - new Date(a.played_at).getTime())
    .slice(0, 8)
    .map((r) => ({ title: r.track_title || '', artist: r.artist || '', cover: r.cover_url, playedAt: r.played_at, trackId: r.track_id }));

  const bars: StatsData['bars'] = [];
  if (periodType === 'season') {
    for (let i = 0; i < days.length; i += 7) {
      const chunk = days.slice(i, i + 7);
      const chunkHours = Math.round((chunk.reduce((s, d) => s + d.minutes, 0) / 60) * 10) / 10;
      const d0 = new Date(chunk[0].date);
      bars.push({ label: `${MONTH_SHORT[d0.getUTCMonth()]} ${d0.getUTCDate()}`, hours: chunkHours, future: chunk.every((d) => d.future) });
    }
  } else {
    for (const d of days) {
      const date = new Date(d.date);
      bars.push({ label: periodType === 'week' ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getUTCDay()] : String(date.getUTCDate()), hours: Math.round((d.minutes / 60) * 10) / 10, future: d.future });
    }
  }

  let comparisonPct: number | null = null;
  if (prevRange) {
    const prevMs = all
      .filter((r) => {
        const t = new Date(r.played_at).getTime();
        return t >= prevRange!.start.getTime() && t < prevRange!.end.getTime();
      })
      .reduce((s, r) => s + (r.duration_ms || 0), 0);
    const prevHours = prevMs / 3600000;
    comparisonPct = prevHours > 0 ? Math.round(((hours - prevHours) / prevHours) * 100) : null;
  }

  const stats: StatsData = {
    periodType,
    periodLabel: range.label,
    periodSub: range.sub,
    comparisonPct,
    comparisonNote,
    hours, trackCount, artistCount, newArtistCount, avgRating, peakHour,
    topArtists, heatmap: hourCounts, genreSplit, bars, recentPlays,
    calendar: { days, activeDays, totalDays, longestStreak, bestDay },
    seasonChips,
  };
  return NextResponse.json(stats);
}
