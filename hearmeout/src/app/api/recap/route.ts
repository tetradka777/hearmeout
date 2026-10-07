import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUserId } from '@/lib/identity';
import { fetchAllRows } from '@/lib/supabasePaginate';
import { canViewProfileData } from '@/lib/userProfile';
import type { RecapData, RecapPeriod } from '@/lib/types';
import { parseSeasonKey, seasonBounds } from '@/lib/seasons';
import { completedWeekRange } from '@/lib/weeks';
import { computeMonthAwards } from '@/lib/monthAwards';
import type { ApiUser } from '@/lib/types';

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
  } else if (period === 'week') {
    // Spec 6.12: the last completed week (offset 0) and the weeks before it.
    const { start, end } = completedWeekRange(Math.min(0, offset), url.searchParams.get('weekStart') === 'sun' ? 'sun' : 'mon', now);
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
    .slice(0, 5)
    .map((a) => ({ id: a.id, name: a.name, cover: a.cover, plays: a.count }));
  const topSongs = [...trackAgg.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map((t) => ({ title: t.title, artist: t.artist, albumId: t.albumId, cover: t.cover, plays: t.count }));
  const totalGenre = [...genreCounts.values()].reduce((s, n) => s + n, 0);
  const topGenres = [...genreCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([genre, n]) => ({ genre, pct: totalGenre ? Math.round((n / totalGenre) * 100) : 0 }));

  // Story-card numbers (spec 3.12 / 6.12): new artists, average score and
  // awards for the same window.
  const artistIds = [...new Set(rows.map((r) => r.artist_id).filter((x): x is string => !!x))];
  const [{ rows: priorRows }, { data: periodRatings }, awards] = await Promise.all([
    artistIds.length
      ? fetchAllRows<{ artist_id: string | null }>((from, to) => admin.from('listening_events').select('artist_id').eq('user_id', targetUserId).in('artist_id', artistIds.slice(0, 300)).lt('played_at', since).range(from, to), 8000)
      : Promise.resolve({ rows: [] as { artist_id: string | null }[], error: null }),
    (() => {
      let q = admin.from('ratings').select('stars, is_private').eq('user_id', targetUserId).gte('created_at', since);
      if (until) q = q.lt('created_at', until);
      return q;
    })(),
    circleAwards(admin, targetUserId, since, until),
  ]);
  const heardBefore = new Set(priorRows.map((r) => r.artist_id));
  const newArtists = artistIds.filter((id) => !heardBefore.has(id)).length;
  const visibleRatings = (periodRatings || []).filter((r) => targetUserId === viewerId || !r.is_private);
  const avgScore = visibleRatings.length ? Math.round((visibleRatings.reduce((s, r) => s + Number(r.stars), 0) / visibleRatings.length) * 10) / 10 : null;

  const recap: RecapData = {
    topArtists, topSongs, topGenres, minutes, uniqueArtists, trackCount: rows.length,
    newArtists, avgScore, awards, range: { start: since, end: until },
  };
  return NextResponse.json(recap);
}

// Awards (lib/monthAwards.ts) this person won in the window, among their own
// circle — themself plus their friends. Same rules as the friend profile's
// Awards tile, just over the recap's period instead of the calendar month.
async function circleAwards(admin: ReturnType<typeof supabaseAdmin>, userId: string, since: string, until: string | null): Promise<string[]> {
  const { data: friendRows } = await admin.from('friendships').select('friend:friend_id(id, name, handle, avatar_url)').eq('user_id', userId);
  const { data: self } = await admin.from('users').select('id, name, handle, avatar_url').eq('id', userId).maybeSingle();
  if (!self) return [];
  const circle: ApiUser[] = [{ id: self.id, name: self.name, handle: self.handle, avatarUrl: self.avatar_url }];
  for (const row of friendRows || []) {
    const f = row.friend as unknown as { id: string; name: string; handle: string; avatar_url: string | null } | null;
    if (f) circle.push({ id: f.id, name: f.name, handle: f.handle, avatarUrl: f.avatar_url });
  }
  const ids = circle.map((u) => u.id);
  // Paged (one request returns at most 1000 rows), each page a fresh query.
  const ev = () => {
    const q = admin.from('listening_events').select('user_id, played_at, duration_ms, genre').in('user_id', ids).gte('played_at', since);
    return until ? q.lt('played_at', until) : q;
  };
  const rt = () => {
    const q = admin.from('ratings').select('user_id, stars').in('user_id', ids).gte('created_at', since);
    return until ? q.lt('created_at', until) : q;
  };
  const [{ rows: events }, { rows: ratings }] = await Promise.all([
    fetchAllRows((f, t) => ev().order('id').range(f, t)),
    fetchAllRows((f, t) => rt().order('id').range(f, t)),
  ]);
  return computeMonthAwards(
    (events || []) as { user_id: string; played_at: string; duration_ms: number | null; genre: string | null }[],
    (ratings || []) as { user_id: string; stars: number }[],
    new Map(circle.map((u) => [u.id, u] as const)),
  )
    .filter((a) => a.winner?.id === userId)
    .map((a) => a.label);
}
