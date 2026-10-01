import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUserId } from '@/lib/identity';
import type { ApiUser, GroupAward, GroupDetail } from '@/lib/types';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'not_registered' }, { status: 401 });
  const { id } = await context.params;

  const admin = supabaseAdmin();
  const { data: group } = await admin.from('groups').select('id, name, created_by').eq('id', id).maybeSingle();
  if (!group) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const { data: memberRows } = await admin.from('group_members').select('user_id').eq('group_id', id);
  const memberIds = (memberRows || []).map((m) => m.user_id as string);
  if (!memberIds.includes(userId)) return NextResponse.json({ error: 'not_a_member' }, { status: 403 });

  const { data: users } = await admin.from('users').select('id, name, handle, avatar_url, is_premium').in('id', memberIds);
  const members: ApiUser[] = (users || []).map((u) => ({ id: u.id, name: u.name, handle: u.handle, avatarUrl: u.avatar_url, isPremium: !!u.is_premium }));
  const userById = new Map(members.map((m) => [m.id, m]));

  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [{ data: ratingsRows }, { data: eventsRows }, { data: allRatingsRows }] = await Promise.all([
    admin.from('ratings').select('user_id, album_id, stars, review, created_at, is_private').in('user_id', memberIds).order('created_at', { ascending: false }).limit(60),
    admin.from('listening_events').select('user_id, played_at, duration_ms, genre').in('user_id', memberIds).gte('played_at', monthAgo).limit(6000),
    // Full rating history per member (not just the last 60 across the whole
    // group) — needed for a real longest-streak count, which the capped
    // activity-feed query above isn't enough data for.
    admin.from('ratings').select('user_id, created_at').in('user_id', memberIds).order('created_at', { ascending: true }).limit(6000),
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

  // Leaderboard: hours listened in the last 30 days, per member.
  const hoursByUser = new Map<string, number>();
  for (const e of eventsRows || []) {
    const k = e.user_id as string;
    hoursByUser.set(k, (hoursByUser.get(k) || 0) + (e.duration_ms || 0));
  }
  const leaderboard = members
    .map((m) => ({ user: m, hours: Math.round(((hoursByUser.get(m.id) || 0) / 3600000) * 10) / 10 }))
    .sort((a, b) => b.hours - a.hours);

  // Auto-computed awards from real member data — no persisted voting yet.
  const awards: GroupAward[] = [];
  if (leaderboard.length && leaderboard[0].hours > 0) {
    awards.push({ label: 'awardMostActive', winner: leaderboard[0].user, detail: `${leaderboard[0].hours}h` });
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
  for (const e of eventsRows || []) {
    if (!e.genre) continue;
    const k = e.user_id as string;
    if (!genresByUser.has(k)) genresByUser.set(k, new Set());
    genresByUser.get(k)!.add(e.genre as string);
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
  let streak: { id: string; days: number } | null = null;
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
    if (!streak || best > streak.days) streak = { id: k, days: best };
  }
  if (streak && streak.days >= 2) {
    const u = userById.get(streak.id);
    if (u) awards.push({ label: 'awardStreak', winner: u, detail: `${streak.days}d` });
  }

  const monthKey = new Date().toISOString().slice(0, 7);
  const { data: voteRows } = await admin.from('group_votes').select('voter_id, candidate_id').eq('group_id', id).eq('month_key', monthKey);
  const voteCounts = new Map<string, number>();
  for (const v of voteRows || []) {
    const k = v.candidate_id as string;
    voteCounts.set(k, (voteCounts.get(k) || 0) + 1);
  }
  const myVoteRow = (voteRows || []).find((v) => v.voter_id === userId);
  const vote = {
    monthKey,
    myVote: myVoteRow ? (myVoteRow.candidate_id as string) : null,
    counts: members
      .map((m) => ({ user: m, count: voteCounts.get(m.id) || 0 }))
      .sort((a, b) => b.count - a.count),
  };

  const detail: GroupDetail = { id: group.id, name: group.name, createdBy: group.created_by, members, awards, activity, leaderboard, vote };
  return NextResponse.json(detail);
}
