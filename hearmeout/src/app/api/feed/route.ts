import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { fetchAllRows } from '@/lib/supabasePaginate';
import { getCurrentUserId } from '@/lib/identity';
import { DEFAULT_PRIVACY, type PrivacyFlags } from '@/lib/privacy';
import type { ApiUser, FeedDisagreement, FeedEvent, FeedResponse } from '@/lib/types';
import { friendIdsOf } from '@/lib/friendIds';
import { memoFeed } from '@/lib/feedMemo';

// Home feed (redesign spec 6.1, 8): real friend activity plus today's
// biggest taste disagreement. Nothing here is premium-gated.
export async function GET(request: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'not_registered' }, { status: 401 });
  // "Today" is the viewer's day (?tz = the browser's getTimezoneOffset()).
  const tzMin = Math.max(-840, Math.min(840, Number(new URL(request.url).searchParams.get('tz')) || 0));
  return NextResponse.json(await memoFeed(userId, tzMin, () => build(userId, tzMin)));
}

type FriendRow = { id: string; name: string; handle: string; avatar_url: string | null; ratings_visible: boolean | null; share_live: boolean | null; public_reviews: boolean | null };
type FriendRating = { user_id: string; album_id: string; stars: number; review: string | null; created_at: string; is_private: boolean | null };
type FriendPlay = { user_id: string; track_id: string | null; track_title: string | null; artist: string | null; album_id: string | null; cover_url: string | null; played_at: string };

async function build(userId: string, tzMin: number): Promise<FeedResponse> {
  const admin = supabaseAdmin();
  const friendIds = await friendIdsOf(admin, userId);

  const now = Date.now();
  const local = new Date(now - tzMin * 60000);
  const dayStart = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) + tzMin * 60000);
  const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
  const monthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Everything in one wave: the two follow-up reads (earlier plays of
  // today's tracks, my scores on the albums friends rated) start as soon as
  // their own first read is back, alongside the rest, not after all of it.
  const friendRatingsP: Promise<FriendRating[]> = friendIds.length
    ? Promise.resolve(admin.from('ratings').select('user_id, album_id, stars, review, created_at, is_private').in('user_id', friendIds).gte('created_at', monthAgo).order('created_at', { ascending: false }).limit(1000)).then((r) => (r.data || []) as FriendRating[])
    : Promise.resolve([]);
  const todayEventsP: Promise<FriendPlay[]> = friendIds.length
    ? Promise.resolve(admin.from('listening_events').select('user_id, track_id, track_title, artist, album_id, cover_url, played_at').in('user_id', friendIds).gte('played_at', dayStart.toISOString()).order('played_at', { ascending: false }).limit(300)).then((r) => (r.data || []) as FriendPlay[])
    : Promise.resolve([]);

  // Earlier plays (30 days) of only the tracks friends played today — all
  // that "first play" needs; reading every play of the month was the slow
  // part of this request.
  const olderEventsP = todayEventsP.then((todayEvents) => {
    const todayTrackIds = [...new Set(todayEvents.map((e) => e.track_id).filter((x): x is string => !!x))];
    const todayTitles = [...new Set(todayEvents.filter((e) => !e.track_id && e.track_title).map((e) => e.track_title as string))];
    const earlier = (column: 'track_id' | 'track_title', values: string[]) => values.length
      ? fetchAllRows<{ user_id: string; track_id: string | null; track_title: string | null }>((f, t) => admin.from('listening_events').select('user_id, track_id, track_title').in('user_id', friendIds).in(column, values).gte('played_at', monthAgo).lt('played_at', dayStart.toISOString()).order('id').range(f, t)).then((r) => r.rows)
      : Promise.resolve([]);
    return Promise.all([earlier('track_id', todayTrackIds), earlier('track_title', todayTitles)]).then((x) => x.flat());
  });
  // My scores only on the albums friends rated this week: the hero needs
  // nothing else. A very long list (the URL would be too long) reads all of
  // mine page by page — a single read also stopped at 1000 rows.
  const myRatingsP = friendRatingsP.then((rows): Promise<{ album_id: string; stars: number }[]> => {
    const ids = [...new Set(rows.filter((r) => r.created_at >= weekAgo).map((r) => r.album_id))];
    if (!ids.length) return Promise.resolve([]);
    if (ids.length <= 150) return Promise.resolve(admin.from('ratings').select('album_id, stars').eq('user_id', userId).in('album_id', ids)).then((r) => r.data || []);
    return fetchAllRows<{ album_id: string; stars: number }>((f, t) => admin.from('ratings').select('album_id, stars').eq('user_id', userId).order('album_id').range(f, t)).then((r) => r.rows);
  });

  const [
    friendUsers,
    friendRatings,
    myRatings,
    todayEvents,
    olderEvents,
    { data: mySessionRows },
    { data: myRecentPlays },
  ] = await Promise.all([
    // Names and privacy switches in one read.
    friendIds.length
      ? Promise.resolve(admin.from('users').select('id, name, handle, avatar_url, ratings_visible, share_live, public_reviews').in('id', friendIds)).then((r) => (r.data || []) as FriendRow[])
      : Promise.resolve([] as FriendRow[]),
    friendRatingsP,
    myRatingsP,
    todayEventsP,
    olderEventsP,
    admin.from('listening_events').select('duration_ms, artist, album_id, cover_url, played_at, track_title').eq('user_id', userId).gte('played_at', dayStart.toISOString()),
    // "Rate what you played": the viewer's own albums of the last two weeks
    // up to the end of yesterday, most recent first, deduped — so the row
    // changes once a day, not with every track. Filtering out already-rated
    // ones happens on the client (it already holds the full rating list).
    admin.from('listening_events').select('album_id, played_at').eq('user_id', userId).not('album_id', 'is', null)
      .gte('played_at', new Date(dayStart.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString()).lt('played_at', dayStart.toISOString())
      .order('played_at', { ascending: false }).limit(1000),
  ]);
  const privacy = new Map<string, PrivacyFlags>(friendUsers.map((u) => [u.id, {
    ratingsVisible: u.ratings_visible !== false,
    shareLive: u.share_live !== false,
    publicReviews: u.public_reviews !== false,
  }]));

  const recentAlbumIds: string[] = [];
  for (const row of myRecentPlays || []) {
    const id = row.album_id as string;
    if (!recentAlbumIds.includes(id)) recentAlbumIds.push(id);
    if (recentAlbumIds.length >= 40) break;
  }

  const userById = new Map<string, ApiUser>(
    friendUsers.map((u) => [u.id, { id: u.id, name: u.name, handle: u.handle, avatarUrl: u.avatar_url }])
  );

  // "Keep private" ratings never leave their owner's own view — not as a
  // feed event, and not as the hero disagreement below.
  // Settings → Privacy: friends who turned off "Ratings visible to friends"
  // don't appear as rating events or in the hero; "Show what I'm playing"
  // off keeps their plays out of first-play events.
  const flags = (id: string) => privacy.get(id) ?? DEFAULT_PRIVACY;
  // A month of ratings for "trending" (a week alone left it nearly empty);
  // the events and the hero use the last week of them.
  const monthFriendRatings = friendRatings.filter((r) => !r.is_private && flags(r.user_id).ratingsVisible);
  const visibleFriendRatings = monthFriendRatings.filter((r) => r.created_at >= weekAgo);

  // Rating-with-review events: friends' recent written reviews.
  const ratingEvents: FeedEvent[] = visibleFriendRatings
    .filter((r) => !!r.review)
    .slice(0, 20)
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
  const seenBefore = new Set(olderEvents.map((e) => `${e.user_id}::${e.track_id || e.track_title || ''}`));
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
  const myByAlbum = new Map(myRatings.map((r) => [r.album_id, Number(r.stars)]));
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

  // Trending in your circle: the last month's friend ratings by album.
  const byAlbum = new Map<string, { raters: Set<string>; sum: number; n: number }>();
  for (const r of monthFriendRatings) {
    const cur = byAlbum.get(r.album_id) || { raters: new Set<string>(), sum: 0, n: 0 };
    cur.raters.add(r.user_id);
    cur.sum += Number(r.stars);
    cur.n += 1;
    byAlbum.set(r.album_id, cur);
  }
  const trending = [...byAlbum.entries()]
    .map(([albumId, v]) => ({ albumId, count: v.raters.size, avg: Math.round((v.sum / v.n) * 10) / 10 }))
    .sort((a, b) => b.count - a.count || b.avg - a.avg)
    .slice(0, 10);

  // Your day so far: the play times, and the track on repeat (2+ plays).
  const todayPlays = (mySessionRows || []).map((r) => r.played_at as string);
  const trackCounts = new Map<string, { title: string; artist: string; plays: number }>();
  for (const r of mySessionRows || []) {
    if (!r.track_title) continue;
    const k = `${r.track_title}|${r.artist ?? ''}`;
    const cur = trackCounts.get(k) || { title: r.track_title as string, artist: (r.artist as string | null) ?? '', plays: 0 };
    cur.plays += 1;
    trackCounts.set(k, cur);
  }
  const topTrack = [...trackCounts.values()].sort((a, b) => b.plays - a.plays)[0];
  const onRepeat = topTrack && topTrack.plays >= 2 ? topTrack : null;

  return { hero, events, recentAlbumIds, trending, todayPlays, onRepeat };
}
