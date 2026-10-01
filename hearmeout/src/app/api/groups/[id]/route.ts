import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUserId } from '@/lib/identity';
import { computeMatch } from '@/lib/matchScore';
import type { ApiUser, GroupAward, GroupDetail, GroupLeaderboardPeriod, GroupMemberStats, GroupRecord, GroupTastePair, GroupTopAlbum, GroupVoteCandidate } from '@/lib/types';

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'not_registered' }, { status: 401 });
  const { id } = await context.params;
  const url = new URL(request.url);
  const leaderboardPeriod: GroupLeaderboardPeriod = url.searchParams.get('period') === 'week' ? 'week' : 'month';

  const admin = supabaseAdmin();
  const { data: group } = await admin.from('groups').select('id, name, created_by').eq('id', id).maybeSingle();
  if (!group) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const { data: memberRows } = await admin.from('group_members').select('user_id').eq('group_id', id);
  const memberIds = (memberRows || []).map((m) => m.user_id as string);
  if (!memberIds.includes(userId)) return NextResponse.json({ error: 'not_a_member' }, { status: 403 });

  const { data: users } = await admin.from('users').select('id, name, handle, avatar_url, is_premium').in('id', memberIds);
  const members: ApiUser[] = (users || []).map((u) => ({ id: u.id, name: u.name, handle: u.handle, avatarUrl: u.avatar_url, isPremium: !!u.is_premium }));
  const userById = new Map(members.map((m) => [m.id, m]));

  const now = new Date();
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

  const [{ data: ratingsRows }, { data: eventsRows }, { data: allRatingsRows }, { data: monthRatingsRows }] = await Promise.all([
    admin.from('ratings').select('user_id, album_id, stars, review, created_at, is_private').in('user_id', memberIds).order('created_at', { ascending: false }).limit(60),
    admin.from('listening_events').select('user_id, played_at, duration_ms, genre').in('user_id', memberIds).gte('played_at', monthAgo).limit(6000),
    // Full rating history per member (not just the last 60 across the whole
    // group) — needed for a real longest-streak count, which the capped
    // activity-feed query above isn't enough data for.
    admin.from('ratings').select('user_id, created_at').in('user_id', memberIds).order('created_at', { ascending: true }).limit(6000),
    // Uncapped, scoped to the current calendar month — member records, the
    // Members cards' figures, "Top albums in this group" and the vote
    // candidates all need a real per-member/per-album picture of this
    // month specifically, which the 60-row activity feed can't guarantee
    // for an active group.
    admin.from('ratings').select('user_id, album_id, stars, created_at').in('user_id', memberIds).gte('created_at', monthStart).limit(6000),
  ]);

  // Activity feed: recent ratings by any member, album title/artist resolved
  // client-side (same convention as everywhere else — ratings.album_id has
  // no FK to the catalog, so the client already knows how to look it up).
  // "Keep private" ratings never show up in a group's shared activity feed.
  const activity = (ratingsRows || []).filter((r) => !r.is_private).slice(0, 20).map((r) => ({
    type: (r.review ? 'review' : 'rating') as 'review' | 'rating',
    user: userById.get(r.user_id as string) || { id: r.user_id as string, name: '?', handle: '', avatarUrl: null },
    albumId: r.album_id as string,
    albumTitle: '',
    albumArtist: '',
    cover: null,
    stars: Number(r.stars),
    review: r.review as string | null,
    createdAt: r.created_at as string,
  }));

  // Leaderboard ("Who listened most"): hours listened in the selected
  // period, per member — re-ranks when the period chip changes (spec 7.10).
  const periodSince = leaderboardPeriod === 'week' ? weekAgo : monthAgo;
  const hoursByUser = new Map<string, number>();
  for (const e of eventsRows || []) {
    if ((e.played_at as string) < periodSince) continue;
    const k = e.user_id as string;
    hoursByUser.set(k, (hoursByUser.get(k) || 0) + (e.duration_ms || 0));
  }
  const leaderboard = members
    .map((m) => ({ user: m, hours: Math.round(((hoursByUser.get(m.id) || 0) / 3600000) * 10) / 10 }))
    .sort((a, b) => b.hours - a.hours);

  // Auto-computed awards from real member data — no persisted voting yet.
  const awards: GroupAward[] = [];
  const monthHoursByUser = new Map<string, number>();
  for (const e of eventsRows || []) {
    const k = e.user_id as string;
    monthHoursByUser.set(k, (monthHoursByUser.get(k) || 0) + (e.duration_ms || 0));
  }
  const monthLeaderboard = members
    .map((m) => ({ user: m, hours: Math.round(((monthHoursByUser.get(m.id) || 0) / 3600000) * 10) / 10 }))
    .sort((a, b) => b.hours - a.hours);
  if (monthLeaderboard.length && monthLeaderboard[0].hours > 0) {
    awards.push({ label: 'awardMostActive', winner: monthLeaderboard[0].user, detail: `${monthLeaderboard[0].hours}h` });
  }
  const nightCounts = new Map<string, { night: number; total: number }>();
  for (const e of eventsRows || []) {
    const k = e.user_id as string;
    const hour = new Date(e.played_at as string).getHours();
    const cur = nightCounts.get(k) || { night: 0, total: 0 };
    cur.total += 1;
    if (hour >= 23 || hour < 5) cur.night += 1;
    nightCounts.set(k, cur);
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
  for (const r of ratingsRows || []) {
    const k = r.user_id as string;
    const arr = ratingsByUser.get(k) || [];
    arr.push(Number(r.stars));
    ratingsByUser.set(k, arr);
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
  const genreCountsByUser = new Map<string, Map<string, number>>();
  for (const e of eventsRows || []) {
    if (!e.genre) continue;
    const k = e.user_id as string;
    if (!genresByUser.has(k)) genresByUser.set(k, new Set());
    genresByUser.get(k)!.add(e.genre as string);
    const counts = genreCountsByUser.get(k) || new Map<string, number>();
    counts.set(e.genre as string, (counts.get(e.genre as string) || 0) + 1);
    genreCountsByUser.set(k, counts);
  }
  let genreExplorer: { id: string; count: number } | null = null;
  for (const [k, set] of genresByUser.entries()) {
    if (!genreExplorer || set.size > genreExplorer.count) genreExplorer = { id: k, count: set.size };
  }
  if (genreExplorer && genreExplorer.count > 0) {
    const u = userById.get(genreExplorer.id);
    if (u) awards.push({ label: 'awardGenreExplorer', winner: u, detail: String(genreExplorer.count) });
  }

  // Longest streak of consecutive calendar days with at least one rating.
  const datesByUser = new Map<string, Set<string>>();
  for (const r of allRatingsRows || []) {
    const k = r.user_id as string;
    const day = (r.created_at as string).slice(0, 10);
    if (!datesByUser.has(k)) datesByUser.set(k, new Set());
    datesByUser.get(k)!.add(day);
  }
  const streakByUser = new Map<string, number>();
  for (const [k, dateSet] of datesByUser.entries()) {
    const days = [...dateSet].sort();
    let best = 1;
    let current = 1;
    for (let i = 1; i < days.length; i++) {
      const prev = new Date(days[i - 1]);
      const cur = new Date(days[i]);
      const diffDays = Math.round((cur.getTime() - prev.getTime()) / 86400000);
      current = diffDays === 1 ? current + 1 : 1;
      if (current > best) best = current;
    }
    streakByUser.set(k, best);
  }
  let streak: { id: string; days: number } | null = null;
  for (const [k, days] of streakByUser.entries()) {
    if (!streak || days > streak.days) streak = { id: k, days };
  }
  if (streak && streak.days >= 2) {
    const u = userById.get(streak.id);
    if (u) awards.push({ label: 'awardStreak', winner: u, detail: `${streak.days}d` });
  }

  // ----- This-month-scoped figures for Members cards and Member records -----
  const monthRatings = monthRatingsRows || [];
  const ratingsThisMonthByUser = new Map<string, { album_id: string; stars: number; created_at: string }[]>();
  for (const r of monthRatings) {
    const k = r.user_id as string;
    const arr = ratingsThisMonthByUser.get(k) || [];
    arr.push({ album_id: r.album_id as string, stars: Number(r.stars), created_at: r.created_at as string });
    ratingsThisMonthByUser.set(k, arr);
  }
  const latestPlayByUser = new Map<string, string>();
  for (const e of eventsRows || []) {
    const k = e.user_id as string;
    const cur = latestPlayByUser.get(k);
    if (!cur || (e.played_at as string) > cur) latestPlayByUser.set(k, e.played_at as string);
  }

  const memberStats: GroupMemberStats[] = members.map((m) => {
    const monthR = ratingsThisMonthByUser.get(m.id) || [];
    const avgScore = monthR.length ? monthR.reduce((s, r) => s + r.stars, 0) / monthR.length : 0;
    return {
      userId: m.id,
      hoursMonth: Math.round(((monthHoursByUser.get(m.id) || 0) / 3600000) * 10) / 10,
      ratingsMonth: monthR.length,
      streakDays: streakByUser.get(m.id) || 0,
      avgScore: Math.round(avgScore * 10) / 10,
    };
  });

  // Group average per album this month — reused for both the vote
  // candidates and "Top albums in this group".
  const albumStatsThisMonth = new Map<string, { sum: number; count: number }>();
  for (const r of monthRatings) {
    const k = r.album_id as string;
    const cur = albumStatsThisMonth.get(k) || { sum: 0, count: 0 };
    cur.sum += Number(r.stars);
    cur.count += 1;
    albumStatsThisMonth.set(k, cur);
  }
  const topAlbums: GroupTopAlbum[] = [...albumStatsThisMonth.entries()]
    .map(([albumId, v]) => ({ albumId, avgScore: Math.round((v.sum / v.count) * 10) / 10, count: v.count }))
    .sort((a, b) => b.count - a.count || b.avgScore - a.avgScore)
    .slice(0, 8);

  // Member records (spec 6.6 item 7) — only shown when there's a real
  // holder; ties go to whoever the Map iteration reaches first.
  const records: GroupRecord[] = [];
  if (streak) records.push({ label: 'recordLongestStreak', holder: userById.get(streak.id) || null, value: `${streak.days}d` });
  let mostRatings: { id: string; count: number } | null = null;
  for (const m of members) {
    const count = (ratingsThisMonthByUser.get(m.id) || []).length;
    if (!mostRatings || count > mostRatings.count) mostRatings = { id: m.id, count };
  }
  if (mostRatings && mostRatings.count > 0) records.push({ label: 'recordMostRatings', holder: userById.get(mostRatings.id) || null, value: String(mostRatings.count) });
  let highestAvg: { id: string; avg: number } | null = null;
  for (const m of members) {
    const arr = ratingsThisMonthByUser.get(m.id) || [];
    if (arr.length < 2) continue;
    const avg = arr.reduce((s, r) => s + r.stars, 0) / arr.length;
    if (!highestAvg || avg > highestAvg.avg) highestAvg = { id: m.id, avg };
  }
  if (highestAvg) records.push({ label: 'recordHighestAverage', holder: userById.get(highestAvg.id) || null, value: highestAvg.avg.toFixed(1) });
  let mostFinished: { id: string; count: number } | null = null;
  for (const m of members) {
    const count = new Set((ratingsThisMonthByUser.get(m.id) || []).map((r) => r.album_id)).size;
    if (!mostFinished || count > mostFinished.count) mostFinished = { id: m.id, count };
  }
  if (mostFinished && mostFinished.count > 0) records.push({ label: 'recordMostFinished', holder: userById.get(mostFinished.id) || null, value: String(mostFinished.count) });
  let latest: { id: string; at: string } | null = null;
  for (const [id, at] of latestPlayByUser.entries()) {
    if (!latest || at > latest.at) latest = { id, at };
  }
  if (latest) records.push({ label: 'recordLatestListener', holder: userById.get(latest.id) || null, value: new Date(latest.at).toLocaleDateString() });
  let hotTake: { id: string; gap: number } | null = null;
  for (const r of monthRatings) {
    const albumStat = albumStatsThisMonth.get(r.album_id as string);
    if (!albumStat || albumStat.count < 2) continue;
    const gap = Math.abs(Number(r.stars) - albumStat.sum / albumStat.count);
    if (!hotTake || gap > hotTake.gap) hotTake = { id: r.user_id as string, gap };
  }
  if (hotTake && hotTake.gap > 0) records.push({ label: 'recordHotTake', holder: userById.get(hotTake.id) || null, value: `±${hotTake.gap.toFixed(1)}` });

  // Group taste (spec 6.6 item 10): average pairwise genre-overlap match
  // across every member pair, from the same 30-day genre data as the
  // Genre explorer award above.
  const genreSharesByUser = new Map<string, { g: string; pct: number }[]>();
  for (const [userKey, counts] of genreCountsByUser.entries()) {
    const total = [...counts.values()].reduce((s, n) => s + n, 0);
    genreSharesByUser.set(userKey, [...counts.entries()].map(([g, n]) => ({ g, pct: total ? Math.round((n / total) * 100) : 0 })));
  }
  const pairs: GroupTastePair[] = [];
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      const a = members[i], b = members[j];
      const sharesA = genreSharesByUser.get(a.id), sharesB = genreSharesByUser.get(b.id);
      if (!sharesA || !sharesB) continue;
      const pct = computeMatch(sharesA, sharesB);
      if (pct != null) pairs.push({ a, b, pct });
    }
  }
  const taste = pairs.length
    ? {
        avgMatch: Math.round(pairs.reduce((s, p) => s + p.pct, 0) / pairs.length),
        closest: [...pairs].sort((a, b) => b.pct - a.pct)[0],
        furthest: [...pairs].sort((a, b) => a.pct - b.pct)[0],
      }
    : null;

  // Album-of-the-month vote (spec 6.6 item 8): candidates are the group's
  // most-rated albums this month, not members — see migration_016.
  const voteCandidateAlbums = topAlbums.slice(0, 3).map((a) => a.albumId);
  const monthKey = new Date().toISOString().slice(0, 7);
  const { data: voteRows } = await admin.from('group_votes').select('voter_id, candidate_id').eq('group_id', id).eq('month_key', monthKey);
  const voteCounts = new Map<string, number>();
  for (const v of voteRows || []) {
    const k = v.candidate_id as string;
    voteCounts.set(k, (voteCounts.get(k) || 0) + 1);
  }
  const myVoteRow = (voteRows || []).find((v) => v.voter_id === userId);
  const candidates: GroupVoteCandidate[] = voteCandidateAlbums.map((albumId) => ({ albumId, count: voteCounts.get(albumId) || 0 }));
  const vote = { monthKey, myVote: myVoteRow ? (myVoteRow.candidate_id as string) : null, candidates };

  const detail: GroupDetail = {
    id: group.id, name: group.name, createdBy: group.created_by,
    members, memberStats, awards, activity, leaderboard, leaderboardPeriod,
    records, topAlbums, taste, vote,
  };
  return NextResponse.json(detail);
}
