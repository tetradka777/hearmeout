import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUserId } from '@/lib/identity';
import { fetchAllRows } from '@/lib/supabasePaginate';
import { canViewProfileData } from '@/lib/userProfile';
import type { StatsData, StatsRange } from '@/lib/types';

const RANGE_DAYS: Record<StatsRange, number | null> = { '4w': 28, '6m': 182, year: 365, all: null };

// Monday-anchored week-start date, used only to bucket "hours per week" —
// not shown to the user as an ISO week number.
function weekStartLabel(d: Date): string {
  const tmp = new Date(d);
  const day = (tmp.getDay() + 6) % 7;
  tmp.setDate(tmp.getDate() - day);
  return tmp.toISOString().slice(0, 10);
}

type Row = { track_id: string | null; track_title: string | null; artist: string | null; artist_id: string | null; cover_url: string | null; genre: string | null; duration_ms: number | null; played_at: string };

export async function GET(request: NextRequest) {
  const viewerId = await getCurrentUserId();
  if (!viewerId) return NextResponse.json({ error: 'not_registered' }, { status: 401 });

  const url = new URL(request.url);
  const range = ((url.searchParams.get('range') as StatsRange) || '6m') as StatsRange;
  const days = RANGE_DAYS[range];
  const since = days ? new Date(Date.now() - days * 24 * 60 * 60 * 1000) : null;
  // Whose data — mirrors /api/recap's viewerId/targetUserId split so a
  // friend's chart can be fetched for comparison. Premium gating below
  // still checks the viewer, not the target, same as recap's season gate.
  const targetUserId = url.searchParams.get('userId') || viewerId;

  const admin = supabaseAdmin();
  // A friend's chart is fetchable for comparison (see the note above); a
  // stranger's isn't — profiles are friends-only, and this endpoint is the
  // one place that data could otherwise leak without ever visiting one.
  if (!(await canViewProfileData(admin, targetUserId, viewerId))) {
    return NextResponse.json({ error: 'not_friends' }, { status: 403 });
  }
  // PostgREST caps every request at its project max-rows setting (1000 by
  // default) regardless of .limit() — a plain .limit(50000) call silently
  // came back with only 1000 rows (the oldest, since sorted ascending),
  // which is why "4 weeks"/"6 months"/"this year" all showed nothing while
  // "all time" looked fine. Paginating with .range() gets the real count.
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
  const inRange = since ? all.filter((r) => new Date(r.played_at) >= since) : all;
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
  const rangeStartMs = since ? since.getTime() : (all.length ? new Date(all[0].played_at).getTime() : Date.now());
  const newArtistCount = [...new Set(inRange.map(artistKey).filter(Boolean))].filter((k) => (firstSeen.get(k) ?? 0) >= rangeStartMs).length;

  const ratingsList = ratings || [];
  const avgRating = ratingsList.length ? Math.round((ratingsList.reduce((s, r) => s + Number(r.stars), 0) / ratingsList.length) * 10) / 10 : 0;

  const hourCounts = new Array(24).fill(0) as number[];
  for (const r of inRange) hourCounts[new Date(r.played_at).getHours()]++;
  const peakHour = inRange.length ? hourCounts.indexOf(Math.max(...hourCounts)) : null;

  const weekMap = new Map<string, number>();
  for (const r of inRange) {
    const wk = weekStartLabel(new Date(r.played_at));
    weekMap.set(wk, (weekMap.get(wk) || 0) + (r.duration_ms || 0));
  }
  const hoursPerWeek = [...weekMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-18)
    .map(([weekLabel, ms]) => ({ weekLabel, hours: Math.round((ms / 3600000) * 10) / 10 }));

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
    .slice(0, 6)
    .map(([genre, n]) => ({ genre, pct: totalGenre ? Math.round((n / totalGenre) * 100) : 0 }));

  const recentPlays = [...inRange]
    .sort((a, b) => new Date(b.played_at).getTime() - new Date(a.played_at).getTime())
    .slice(0, 8)
    .map((r) => ({ title: r.track_title || '', artist: r.artist || '', cover: r.cover_url, playedAt: r.played_at, trackId: r.track_id }));

  const stats: StatsData = {
    range, hours, trackCount, artistCount, newArtistCount, avgRating, peakHour,
    hoursPerWeek, topArtists, heatmap: hourCounts, genreSplit, recentPlays,
  };
  return NextResponse.json(stats);
}
