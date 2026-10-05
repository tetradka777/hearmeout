import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUserId } from '@/lib/identity';
import { DEFAULT_PRIVACY, fetchPrivacy } from '@/lib/privacy';
import type { ApiUser, FeedDisagreement, FeedEvent, FeedResponse } from '@/lib/types';

// Home feed (redesign spec 6.1, 8): real friend activity plus today's
// biggest taste disagreement. Nothing here is premium-gated.
export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'not_registered' }, { status: 401 });

  const admin = supabaseAdmin();
  const { data: friendRows } = await admin.from('friendships').select('friend_id').eq('user_id', userId);
  const friendIds = (friendRows || []).map((r) => r.friend_id as string);

  const now = Date.now();
  const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0);
  const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
  const monthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [
    { data: friendUsers },
    { data: friendRatings },
    { data: myRatings },
    { data: todayEvents },
    { data: olderEvents },
    { data: mySessionRows },
  ] = await Promise.all([
    friendIds.length
      ? admin.from('users').select('id, name, handle, avatar_url').in('id', friendIds)
      : Promise.resolve({ data: [] as { id: string; name: string; handle: string; avatar_url: string | null }[] }),
    friendIds.length
      ? admin.from('ratings').select('user_id, album_id, stars, review, created_at, is_private').in('user_id', friendIds).gte('created_at', weekAgo).order('created_at', { ascending: false }).limit(20)
      : Promise.resolve({ data: [] as { user_id: string; album_id: string; stars: number; review: string | null; created_at: string; is_private: boolean | null }[] }),
    admin.from('ratings').select('album_id, stars').eq('user_id', userId),
    friendIds.length
      ? admin.from('listening_events').select('user_id, track_id, track_title, artist, album_id, cover_url, played_at').in('user_id', friendIds).gte('played_at', dayStart.toISOString()).order('played_at', { ascending: false }).limit(300)
      : Promise.resolve({ data: [] as { user_id: string; track_id: string | null; track_title: string | null; artist: string | null; album_id: string | null; cover_url: string | null; played_at: string }[] }),
    friendIds.length
      ? admin.from('listening_events').select('user_id, track_id, track_title').in('user_id', friendIds).gte('played_at', monthAgo).lt('played_at', dayStart.toISOString()).limit(6000)
      : Promise.resolve({ data: [] as { user_id: string; track_id: string | null; track_title: string | null }[] }),
    admin.from('listening_events').select('duration_ms, artist, album_id, cover_url, played_at').eq('user_id', userId).gte('played_at', dayStart.toISOString()),
  ]);

  // "Rate what you played": the viewer's own recently played albums, most
  // recent first, deduped. Filtering out already-rated ones happens on the
  // client (it already holds the full rating list).
  const fiveDaysAgo = new Date(now - 5 * 24 * 60 * 60 * 1000).toISOString();
  const { data: myRecentPlays } = await admin
    .from('listening_events')
    .select('album_id, played_at')
    .eq('user_id', userId)
    .not('album_id', 'is', null)
    .gte('played_at', fiveDaysAgo)
    .order('played_at', { ascending: false })
    .limit(200);
  const recentAlbumIds: string[] = [];
  for (const row of myRecentPlays || []) {
    const id = row.album_id as string;
    if (!recentAlbumIds.includes(id)) recentAlbumIds.push(id);
    if (recentAlbumIds.length >= 8) break;
  }

  const userById = new Map<string, ApiUser>(
    (friendUsers || []).map((u) => [u.id, { id: u.id, name: u.name, handle: u.handle, avatarUrl: u.avatar_url }])
  );

  // "Keep private" ratings never leave their owner's own view — not as a
  // feed event, and not as the hero disagreement below.
  // Settings → Privacy: friends who turned off "Ratings visible to friends"
  // don't appear as rating events or in the hero; "Show what I'm playing"
  // off keeps their plays out of first-play events.
  const privacy = await fetchPrivacy(admin, friendIds);
  const flags = (id: string) => privacy.get(id) ?? DEFAULT_PRIVACY;
  const visibleFriendRatings = (friendRatings || []).filter((r) => !r.is_private && flags(r.user_id).ratingsVisible);

  // Rating-with-review events: friends' recent written reviews.
  const ratingEvents: FeedEvent[] = visibleFriendRatings
    .filter((r) => !!r.review)
    .map((r) => ({
      type: 'rating_review' as const,
      user: userById.get(r.user_id) || { id: r.user_id, name: '?', handle: '', avatarUrl: null },
      albumId: r.album_id,
      stars: Number(r.stars),
      review: r.review as string,
      at: r.created_at,
    }));

  // First-play events: a track played today that this friend has no record
  // of playing in the preceding 30 days. Deduped per (user, track) so a
  // repeated listen today doesn't produce multiple "first play" events.
  const seenBefore = new Set((olderEvents || []).map((e) => `${e.user_id}::${e.track_id || e.track_title || ''}`));
  const firstPlaySeen = new Set<string>();
  const firstPlayEvents: FeedEvent[] = [];
  for (const e of todayEvents || []) {
    const key = `${e.user_id}::${e.track_id || e.track_title || ''}`;
    if (seenBefore.has(key) || firstPlaySeen.has(key) || !e.track_title || !flags(e.user_id).shareLive) continue;
    firstPlaySeen.add(key);
    firstPlayEvents.push({
      type: 'first_play',
      user: userById.get(e.user_id) || { id: e.user_id, name: '?', handle: '', avatarUrl: null },
      trackTitle: e.track_title,
      artist: e.artist || '',
      albumId: e.album_id ?? null,
      cover: e.cover_url ?? null,
      at: e.played_at,
    });
  }

  // The viewer's own session today, shown as a single feed tile.
  const events: FeedEvent[] = [...ratingEvents, ...firstPlayEvents]
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 12);
  const myPlays = mySessionRows || [];
  if (myPlays.length > 0) {
    const minutes = Math.round(myPlays.reduce((s, r) => s + (r.duration_ms || 0), 0) / 60000);
    // The session tile (prototype ev3): cover of today's most played album,
    // distinct artists, when it started.
    const byAlbum = new Map<string, { n: number; cover: string | null }>();
    for (const r of myPlays) {
      if (!r.album_id) continue;
      const cur = byAlbum.get(r.album_id as string) || { n: 0, cover: (r.cover_url as string | null) ?? null };
      cur.n += 1;
      byAlbum.set(r.album_id as string, cur);
    }
    const top = [...byAlbum.entries()].sort((a, b) => b[1].n - a[1].n)[0];
    const artists = new Set(myPlays.map((r) => r.artist).filter(Boolean)).size;
    const started = myPlays.map((r) => r.played_at as string).sort()[0] ?? new Date().toISOString();
    events.unshift({ type: 'session', plays: myPlays.length, minutes, artists, albumId: top?.[0] ?? null, cover: top?.[1].cover ?? null, at: started });
  }

  // Hero: the single biggest gap between the viewer's score and a friend's
  // recent score on an album both of them rated.
  const myByAlbum = new Map((myRatings || []).map((r) => [r.album_id, Number(r.stars)]));
  let hero: FeedDisagreement | null = null;
  for (const r of visibleFriendRatings) {
    const mine = myByAlbum.get(r.album_id);
    if (mine == null) continue;
    const gap = Math.abs(mine - Number(r.stars));
    if (!hero || gap > Math.abs(hero.mine - hero.theirs)) {
      hero = {
        friend: userById.get(r.user_id) || { id: r.user_id, name: '?', handle: '', avatarUrl: null },
        albumId: r.album_id,
        mine,
        theirs: Number(r.stars),
        at: r.created_at,
      };
    }
  }

  const body: FeedResponse = { hero, events, recentAlbumIds };
  return NextResponse.json(body);
}
