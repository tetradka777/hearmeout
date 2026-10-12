import type { ApiUser, GroupAward } from './types';

// A play as the awards read it; the track/album fields feed Scout and Stuck
// (callers that don't select them just don't get those two).
export type AwardEvent = {
  user_id: string;
  played_at: string;
  duration_ms: number | null;
  genre: string | null;
  track_id?: string | null;
  track_title?: string | null;
  artist?: string | null;
  album_id?: string | null;
  album?: string | null;
  release_year?: number | null;
};

const SCOUT_LEAD_MS = 60 * 60 * 1000;
const STUCK_MIN_PLAYS = 5;
const TRAVELER_MIN_PLAYS = 20;
const TRAVELER_MIN_AGE = 10;

// Scout: who heard an album first. Counted per album that at least two
// people played in the window: the one whose first play came before
// everyone else's by an hour or more (not two friends listening together)
// scouted it. The most scouted albums wins; detail = how many.
export function scoutAward(events: AwardEvent[], userById: Map<string, ApiUser>): GroupAward | null {
  const firstPlay = new Map<string, Map<string, number>>(); // album → user → first play
  for (const e of events) {
    const album = e.album_id || (e.album ? `${e.album}\u0000${e.artist ?? ''}` : null);
    if (!album) continue;
    const t = new Date(e.played_at).getTime();
    const byUser = firstPlay.get(album) || new Map<string, number>();
    if (!byUser.has(e.user_id) || t < byUser.get(e.user_id)!) byUser.set(e.user_id, t);
    firstPlay.set(album, byUser);
  }
  const scouted = new Map<string, number>();
  for (const byUser of firstPlay.values()) {
    if (byUser.size < 2) continue;
    const [first, second] = [...byUser.entries()].sort((a, b) => a[1] - b[1]);
    if (second[1] - first[1] >= SCOUT_LEAD_MS) scouted.set(first[0], (scouted.get(first[0]) || 0) + 1);
  }
  let best: { id: string; n: number } | null = null;
  for (const [id, n] of scouted) if (!best || n > best.n) best = { id, n };
  const u = best ? userById.get(best.id) : undefined;
  return best && u ? { label: 'awardScout', winner: u, detail: String(best.n) } : null;
}

// Stuck: the most plays of one track by one person in the window (at least
// five). Detail = "track · N×".
export function stuckAward(events: AwardEvent[], userById: Map<string, ApiUser>): GroupAward | null {
  const counts = new Map<string, { user: string; title: string; n: number }>();
  for (const e of events) {
    const track = e.track_id || (e.track_title ? `${e.track_title}\u0000${e.artist ?? ''}` : null);
    if (!track) continue;
    const key = `${e.user_id}\u0000${track}`;
    const cur = counts.get(key) || { user: e.user_id, title: e.track_title || '', n: 0 };
    cur.n += 1;
    counts.set(key, cur);
  }
  let best: { user: string; title: string; n: number } | null = null;
  for (const c of counts.values()) if (!best || c.n > best.n) best = c;
  const u = best && best.n >= STUCK_MIN_PLAYS ? userById.get(best.user) : undefined;
  return best && u ? { label: 'awardStuck', winner: u, detail: `${best.title} · ${best.n}×` } : null;
}

// Time traveler: whose music is the oldest. The median release year of
// someone's plays (only those with a known year, at least 20 of them); the
// earliest median wins if it's at least ten years back. Detail = the year.
export function timeTravelerAward(events: AwardEvent[], userById: Map<string, ApiUser>, now = new Date()): GroupAward | null {
  const years = new Map<string, number[]>();
  for (const e of events) {
    const y = Number(e.release_year);
    if (!y || y < 1900) continue;
    const arr = years.get(e.user_id) || [];
    arr.push(y);
    years.set(e.user_id, arr);
  }
  let best: { id: string; year: number } | null = null;
  for (const [id, arr] of years) {
    if (arr.length < TRAVELER_MIN_PLAYS) continue;
    arr.sort((a, b) => a - b);
    const mid = arr.length >> 1;
    const year = arr.length % 2 ? arr[mid] : Math.round((arr[mid - 1] + arr[mid]) / 2);
    if (!best || year < best.year) best = { id, year };
  }
  const u = best && best.year <= now.getFullYear() - TRAVELER_MIN_AGE ? userById.get(best.id) : undefined;
  return best && u ? { label: 'awardTimeTraveler', winner: u, detail: String(best.year) } : null;
}

// The "real data" monthly awards (most active, night owl, harshest critic,
// genre explorer, scout, stuck, time traveler) as a pure function of one month's rows for a set
// of people. Used by the group page (live month and past-months history)
// and by the friend profile (awards a friend won within their own circle).
// Leaves out the group page's streak award: a consecutive-day streak isn't
// bounded by one calendar month the way these are.
export function computeMonthAwards(
  monthEvents: AwardEvent[],
  monthRatings: { user_id: string; stars: number }[],
  userById: Map<string, ApiUser>
): GroupAward[] {
  const awards: GroupAward[] = [];

  const hoursByUser = new Map<string, number>();
  for (const e of monthEvents) hoursByUser.set(e.user_id, (hoursByUser.get(e.user_id) || 0) + (e.duration_ms || 0));
  let mostActive: { id: string; hours: number } | null = null;
  for (const [k, ms] of hoursByUser.entries()) {
    const hours = Math.round((ms / 3600000) * 10) / 10;
    if (!mostActive || hours > mostActive.hours) mostActive = { id: k, hours };
  }
  if (mostActive && mostActive.hours > 0) {
    const u = userById.get(mostActive.id);
    if (u) awards.push({ label: 'awardMostActive', winner: u, detail: `${mostActive.hours}h` });
  }

  const nightCounts = new Map<string, { night: number; total: number }>();
  for (const e of monthEvents) {
    const cur = nightCounts.get(e.user_id) || { night: 0, total: 0 };
    cur.total += 1;
    const hour = new Date(e.played_at).getHours();
    if (hour >= 23 || hour < 5) cur.night += 1;
    nightCounts.set(e.user_id, cur);
  }
  let nightOwl: { id: string; pct: number } | null = null;
  for (const [k, v] of nightCounts.entries()) {
    if (v.total < 5) continue;
    const pct = Math.round((v.night / v.total) * 100);
    if (!nightOwl || pct > nightOwl.pct) nightOwl = { id: k, pct };
  }
  if (nightOwl && nightOwl.pct > 0) {
    const u = userById.get(nightOwl.id);
    if (u) awards.push({ label: 'awardNightOwl', winner: u, detail: `${nightOwl.pct}%` });
  }

  const ratingsByUser = new Map<string, number[]>();
  for (const r of monthRatings) {
    const arr = ratingsByUser.get(r.user_id) || [];
    arr.push(Number(r.stars));
    ratingsByUser.set(r.user_id, arr);
  }
  let harshest: { id: string; avg: number } | null = null;
  for (const [k, arr] of ratingsByUser.entries()) {
    if (arr.length < 2) continue;
    const avg = arr.reduce((s, n) => s + n, 0) / arr.length;
    if (!harshest || avg < harshest.avg) harshest = { id: k, avg };
  }
  if (harshest) {
    const u = userById.get(harshest.id);
    if (u) awards.push({ label: 'awardHarshestCritic', winner: u, detail: harshest.avg.toFixed(1) });
  }

  const genresByUser = new Map<string, Set<string>>();
  for (const e of monthEvents) {
    if (!e.genre) continue;
    if (!genresByUser.has(e.user_id)) genresByUser.set(e.user_id, new Set());
    genresByUser.get(e.user_id)!.add(e.genre);
  }
  let genreExplorer: { id: string; count: number } | null = null;
  for (const [k, set] of genresByUser.entries()) {
    if (!genreExplorer || set.size > genreExplorer.count) genreExplorer = { id: k, count: set.size };
  }
  if (genreExplorer && genreExplorer.count > 0) {
    const u = userById.get(genreExplorer.id);
    if (u) awards.push({ label: 'awardGenreExplorer', winner: u, detail: String(genreExplorer.count) });
  }

  const scout = scoutAward(monthEvents, userById);
  if (scout) awards.push(scout);
  const stuck = stuckAward(monthEvents, userById);
  if (stuck) awards.push(stuck);
  const traveler = timeTravelerAward(monthEvents, userById);
  if (traveler) awards.push(traveler);

  return awards;
}
