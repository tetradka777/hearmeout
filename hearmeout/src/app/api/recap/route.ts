import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUserId } from '@/lib/identity';
import { fetchAllRows } from '@/lib/supabasePaginate';
import { canViewProfileData } from '@/lib/userProfile';
import type { RecapData, RecapPeriod } from '@/lib/types';
import { parseSeasonKey, seasonBounds } from '@/lib/seasons';

type Row = { track_id: string | null; track_title: string | null; artist: string | null; artist_id: string | null; album_id: string | null; cover_url: string | null; genre: string | null; duration_ms: number | null };

export async function GET(request: NextRequest) {
  const viewerId = await getCurrentUserId();
  if (!viewerId) return NextResponse.json({ error: 'not_registered' }, { status: 401 });

  const url = new URL(request.url);
  const period = (url.searchParams.get('period') as RecapPeriod) || 'day';
  const targetUserId = url.searchParams.get('userId') || viewerId;
  // vRecap() in the prototype has a second chip row for day (Today/
  // Yesterday) and month (This month/Last month) — real calendar-boundary
  // windows, not a rolling "last N days".
  const offset = Number(url.searchParams.get('offset') || 0) || 0;

  const admin = supabaseAdmin();

  // Same friends-only boundary as the profile page itself — a recap is just
  // another view into someone's listening data.
  if (!(await canViewProfileData(admin, targetUserId, viewerId))) {
    return NextResponse.json({ error: 'not_friends' }, { status: 403 });
  }

  // An explicit ?season=2025-summer picks a real historical window instead
  // of "the last 90 days from now" — parsed to real calendar-month bounds.
  const seasonParam = url.searchParams.get('season');
  const parsedSeason = seasonParam ? parseSeasonKey(seasonParam) : null;
  const now = new Date();
  let since: string;
  let until: string | null = null;
  if (parsedSeason) {
    const { start, end } = seasonBounds(parsedSeason.year, parsedSeason.season);
    since = start.toISOString();
    until = end.toISOString();
  } else if (period === 'month') {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
    since = start.toISOString();
    until = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1)).toISOString();
  } else {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offset));
    since = start.toISOString();
    until = new Date(start.getTime() + 24 * 60 * 60 * 1000).toISOString();
  }

  // Paginated for the same reason as /api/stats: PostgREST caps a single
  // request at its project max-rows (1000 by default) no matter what
  // .limit() is requested. That's what made "month" and "season" recaps
  // look identical — both got silently truncated to the same first 1000
  // rows once a range held more than that, regardless of period length —
  // and ordering by recency (added alongside this) makes them genuinely
  // diverge instead of coincidentally overlapping.
  const { rows, error } = await fetchAllRows<Row>((from, to) => {
    let q = admin
      .from('listening_events')
      .select('track_id, track_title, artist, artist_id, album_id, cover_url, genre, duration_ms')
      .eq('user_id', targetUserId)
      .gte('played_at', since);
    if (until) q = q.lt('played_at', until);
    return q.order('played_at', { ascending: false }).range(from, to);
  }, 8000);
  if (error) return NextResponse.json({ error }, { status: 500 });
  const minutes = Math.round(rows.reduce((s, r) => s + (r.duration_ms || 0), 0) / 60000);
  const uniqueArtists = new Set(rows.map((r) => r.artist_id || r.artist).filter(Boolean)).size;

  type ArtistAgg = { id: string | null; name: string; cover: string | null; count: number };
  type TrackAgg = { title: string; artist: string; albumId: string | null; cover: string | null; count: number };

  const artistAgg = new Map<string, ArtistAgg>();
  const trackAgg = new Map<string, TrackAgg>();
  const genreCounts = new Map<string, number>();

  for (const r of rows) {
    if (r.artist) {
      const key = r.artist_id || r.artist;
      const existing = artistAgg.get(key);
      if (existing) existing.count += 1;
      else artistAgg.set(key, { id: r.artist_id, name: r.artist, cover: r.cover_url, count: 1 });
    }
    if (r.track_title && r.artist) {
      const key = r.track_id || `${r.track_title}—${r.artist}`;
      const existing = trackAgg.get(key);
      if (existing) existing.count += 1;
      else trackAgg.set(key, { title: r.track_title, artist: r.artist, albumId: r.album_id, cover: r.cover_url, count: 1 });
    }
    if (r.genre) genreCounts.set(r.genre, (genreCounts.get(r.genre) || 0) + 1);
  }

  const topArtists = [...artistAgg.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)
    .map((a) => ({ id: a.id, name: a.name, cover: a.cover, plays: a.count }));
  const topSongs = [...trackAgg.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)
    .map((t) => ({ title: t.title, artist: t.artist, albumId: t.albumId, cover: t.cover, plays: t.count }));
  const totalGenre = [...genreCounts.values()].reduce((s, n) => s + n, 0);
  const topGenres = [...genreCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([genre, n]) => ({ genre, pct: totalGenre ? Math.round((n / totalGenre) * 100) : 0 }));

  const recap: RecapData = { topArtists, topSongs, topGenres, minutes, uniqueArtists, trackCount: rows.length };
  return NextResponse.json(recap);
}
