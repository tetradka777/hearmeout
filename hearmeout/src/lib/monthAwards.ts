import type { ApiUser, GroupAward } from './types';

// The four "real data" monthly awards (most active, night owl, harshest
// critic, genre explorer) as a pure function of one month's rows for a set
// of people. Used by the group page (live month and past-months history)
// and by the friend profile (awards a friend won within their own circle).
// Leaves out the group page's streak award: a consecutive-day streak isn't
// bounded by one calendar month the way these are.
export function computeMonthAwards(
  monthEvents: { user_id: string; played_at: string; duration_ms: number | null; genre: string | null }[],
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

  return awards;
}
