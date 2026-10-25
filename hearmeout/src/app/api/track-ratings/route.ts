import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/identity';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { DEFAULT_PRIVACY, fetchPrivacy } from '@/lib/privacy';

// Track ratings (migration 031). A track is "<album id>:<track number>".
// GET ?albumId= → your scores, your friends' average per track (only those
// whose ratings are visible to friends) and the album's best track by
// everyone's average. POST { albumId, trackNumber, title, stars } sets
// yours; stars null removes it. Before the migration: ready false.
export type TrackRatingsResponse = {
  ready: boolean;
  mine: Record<number, number>;
  friends: Record<number, { avg: number; n: number }>;
  best: number | null;
};

const keyOf = (albumId: string, n: number) => `${albumId}:${n}`;
const numberOf = (trackId: string) => Number(trackId.slice(trackId.lastIndexOf(':') + 1));

export async function GET(request: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'not_registered' }, { status: 401 });
  const albumId = new URL(request.url).searchParams.get('albumId') || '';
  if (!albumId) return NextResponse.json({ error: 'missing_album' }, { status: 400 });
  const admin = supabaseAdmin();

  const [{ data: rows, error }, { data: friendRows }] = await Promise.all([
    admin.from('track_ratings').select('user_id, track_id, stars').eq('album_id', albumId).limit(5000),
    admin.from('friendships').select('friend_id').eq('user_id', userId),
  ]);
  if (error) return NextResponse.json({ ready: false, mine: {}, friends: {}, best: null } satisfies TrackRatingsResponse);

  const friendIds = new Set((friendRows || []).map((f) => f.friend_id as string));
  const privacy = await fetchPrivacy(admin, [...friendIds]);
  const mine: Record<number, number> = {};
  const sums = new Map<number, { s: number; n: number }>();
  const all = new Map<number, { s: number; n: number }>();
  for (const r of rows || []) {
    const n = numberOf(r.track_id as string);
    const stars = Number(r.stars);
    const a = all.get(n) || { s: 0, n: 0 };
    all.set(n, { s: a.s + stars, n: a.n + 1 });
    if (r.user_id === userId) mine[n] = stars;
    else if (friendIds.has(r.user_id as string) && (privacy.get(r.user_id as string) ?? DEFAULT_PRIVACY).ratingsVisible) {
      const f = sums.get(n) || { s: 0, n: 0 };
      sums.set(n, { s: f.s + stars, n: f.n + 1 });
    }
  }
  const friends: Record<number, { avg: number; n: number }> = {};
  for (const [n, v] of sums) friends[n] = { avg: Math.round((v.s / v.n) * 10) / 10, n: v.n };
  // The best track: the highest average across everyone who rated it.
  let best: { n: number; avg: number; c: number } | null = null;
  for (const [n, v] of all) {
    const avg = v.s / v.n;
    if (!best || avg > best.avg || (avg === best.avg && v.n > best.c)) best = { n, avg, c: v.n };
  }
  return NextResponse.json({ ready: true, mine, friends, best: best?.n ?? null } satisfies TrackRatingsResponse);
}

export async function POST(request: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'not_registered' }, { status: 401 });
  const body = await request.json().catch(() => null);
  const albumId = typeof body?.albumId === 'string' ? body.albumId.slice(0, 64) : '';
  const n = Number(body?.trackNumber);
  const title = typeof body?.title === 'string' ? body.title.slice(0, 300) : '';
  if (!albumId || !Number.isInteger(n) || n < 1 || n > 500 || !title) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const admin = supabaseAdmin();
  const trackId = keyOf(albumId, n);
  if (body?.stars == null) {
    const { error } = await admin.from('track_ratings').delete().eq('user_id', userId).eq('track_id', trackId);
    return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ ok: true });
  }
  const stars = Math.round(Number(body.stars) * 10) / 10;
  if (!(stars >= 0.1 && stars <= 5)) return NextResponse.json({ error: 'bad_stars' }, { status: 400 });
  const { error } = await admin.from('track_ratings').upsert(
    { user_id: userId, album_id: albumId, track_id: trackId, track_title: title, stars, updated_at: new Date().toISOString() },
    { onConflict: 'user_id,track_id' },
  );
  return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ ok: true });
}
