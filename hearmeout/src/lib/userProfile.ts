import type { SupabaseClient } from '@supabase/supabase-js';
import type { ApiUser, NowPlaying, PublicProfile } from './types';
import { isDemoAccountId } from './demoAccounts';
import { computeMonthAwards } from './monthAwards';

// The sync job polls Spotify's recently-played list periodically rather
// than instantly, so "still playing" is an approximation, capped at 6
// minutes even for a genuinely long track — matches the real cadence of
// how fresh this data actually is instead of implying true real-time.
const NOW_PLAYING_MAX_AGE_MS = 6 * 60 * 1000;

// Isolated from the main `users` select on purpose: a combined
// `.select('a, b, is_open_profile')` fails atomically if any named column
// is missing, and this column only exists once migration_013 has been run
// (supabase/migration_013_open_profile.sql) — kept separate so profiles
// keep working (as "closed", the same default the column will have) before
// that migration lands, and pick up the real value automatically once it
// does, no code change needed either way.
export async function fetchIsOpenProfile(admin: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await admin.from('users').select('is_open_profile').eq('id', userId).maybeSingle();
  if (error) return false;
  return !!data?.is_open_profile;
}

// The person's most recent play, however old, plus whether it still counts
// as "listening now" (see NOW_PLAYING_MAX_AGE_MS above).
async function fetchLastPlay(admin: SupabaseClient, userId: string): Promise<{ last: NowPlaying | null; live: boolean }> {
  const { data } = await admin
    .from('listening_events')
    .select('track_title, artist, cover_url, played_at, duration_ms, album_id')
    .eq('user_id', userId)
    .order('played_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data?.track_title || !data.artist) return { last: null, live: false };
  const playedAt = new Date(data.played_at as string).getTime();
  const age = Date.now() - playedAt;
  const durationMs = (data.duration_ms as number | null) ?? null;
  const stillPlayingWindow = Math.min(durationMs ?? NOW_PLAYING_MAX_AGE_MS, NOW_PLAYING_MAX_AGE_MS);
  const last: NowPlaying = { title: data.track_title as string, artist: data.artist as string, cover: (data.cover_url as string | null) ?? null, startedAt: data.played_at as string, durationMs, albumId: (data.album_id as string | null) ?? null };
  return { last, live: age >= 0 && age <= stillPlayingWindow };
}

// Awards (lib/monthAwards.ts) this person won this calendar month within
// their own circle — themself plus their friends.
async function fetchCircleAwards(admin: SupabaseClient, userId: string, friends: ApiUser[], self: ApiUser): Promise<{ label: string; detail: string }[]> {
  const circle = [self, ...friends];
  const ids = circle.map((u) => u.id);
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const [{ data: events }, { data: monthRatings }] = await Promise.all([
    admin.from('listening_events').select('user_id, played_at, duration_ms, genre').in('user_id', ids).gte('played_at', monthStart.toISOString()).limit(6000),
    admin.from('ratings').select('user_id, stars').in('user_id', ids).gte('created_at', monthStart.toISOString()).limit(6000),
  ]);
  const userById = new Map(circle.map((u) => [u.id, u] as const));
  return computeMonthAwards(
    (events || []) as { user_id: string; played_at: string; duration_ms: number | null; genre: string | null }[],
    (monthRatings || []) as { user_id: string; stars: number }[],
    userById,
  )
    .filter((a) => a.winner?.id === userId)
    .map((a) => ({ label: a.label, detail: a.detail }));
}

// `viewerId` is who's asking — friends-of-friends discovery (showing this
// person's own friend list) and their recent activity only go out when the
// viewer is this person themself or already an accepted friend of theirs,
// so a stranger's full social graph isn't exposed to anyone who finds a link.
//
// A stranger otherwise gets one of two things, decided purely by the
// account owner's own `is_open_profile` setting (Settings > Account) — the
// same setting whether they arrive by in-app search or by the /u/[handle]
// share link, so going private closes both doors at once:
//   - open: the teaser tier (stats/genres/top albums, never reviews or the
//     friend graph)
//   - closed (the default): a locked name-card stub
export async function getUserProfile(
  admin: SupabaseClient,
  userId: string,
  viewerId?: string | null
): Promise<PublicProfile | null> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [{ data: user, error: userErr }, { data: ratings }, { data: genreRows }, { data: todayRows }, lastPlay, isOpenProfile] = await Promise.all([
    admin.from('users').select('id, name, handle, avatar_url, created_at').eq('id', userId).maybeSingle(),
    admin.from('ratings').select('album_id, stars, review, tags, created_at, is_private').eq('user_id', userId).order('created_at', { ascending: false }),
    admin.from('listening_events').select('genre').eq('user_id', userId).not('genre', 'is', null).limit(5000),
    admin.from('listening_events').select('duration_ms').eq('user_id', userId).gte('played_at', startOfDay.toISOString()),
    fetchLastPlay(admin, userId),
    fetchIsOpenProfile(admin, userId),
  ]);

  if (userErr) throw userErr;
  if (!user) return null;

  const isSelf = !!viewerId && viewerId === userId;
  const isMutualFriend = !isSelf && !!viewerId && await isFriendOf(admin, userId, viewerId);
  // Demo fixture accounts (see demoAccounts.ts) are open to everyone — the
  // whole point is letting a friendless user try the comparison feature.
  const isOpen = isSelf || isMutualFriend || isDemoAccountId(userId);
  const isPublicTeaser = !isOpen && isOpenProfile;

  // Full profiles are for the account owner and their accepted friends only
  // — anyone else (including someone who just found this person by search)
  // gets a name-card stub, not real stats/history/currently-playing, unless
  // the owner opted their profile open. Search and sending a friend request
  // still work either way; *viewing* the profile is what's gated.
  if (!isOpen && !isPublicTeaser) {
    return {
      id: user.id,
      name: user.name,
      handle: user.handle,
      avatarUrl: user.avatar_url,
      locked: true,
      stats: { ratings: 0, avg: 0, reviews: 0 },
      nowPlaying: null,
      genres: [],
      top4Albums: [],
      minutesToday: 0,
      joinedAt: user.created_at as string,
    };
  }

  const ratingsList = ratings || [];
  const avg = ratingsList.length ? ratingsList.reduce((s, r) => s + Number(r.stars), 0) / ratingsList.length : 0;
  const reviewsCount = ratingsList.filter((r) => r.review).length;
  // "Keep private" (spec 6.2/7.4) hides an individual rating/review from
  // everyone but its owner — it still counts toward the owner's own totals
  // above, but never surfaces in a list someone else can read through.
  const visibleRatingsList = isSelf ? ratingsList : ratingsList.filter((r) => !r.is_private);
  const top4Albums = [...visibleRatingsList].sort((a, b) => Number(b.stars) - Number(a.stars)).slice(0, 4).map((r) => r.album_id as string);

  const genreCounts = new Map<string, number>();
  for (const row of genreRows || []) {
    const g = row.genre as string;
    genreCounts.set(g, (genreCounts.get(g) || 0) + 1);
  }
  const totalGenreEvents = [...genreCounts.values()].reduce((s, n) => s + n, 0);
  const genres = [...genreCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([g, count]) => ({ g, pct: totalGenreEvents ? Math.round((count / totalGenreEvents) * 100) : 0 }));

  const minutesToday = Math.round((todayRows || []).reduce((s, r) => s + (r.duration_ms || 0), 0) / 60000);

  const profile: PublicProfile = {
    id: user.id,
    name: user.name,
    handle: user.handle,
    avatarUrl: user.avatar_url,
    stats: { ratings: ratingsList.length, avg: Math.round(avg * 10) / 10, reviews: reviewsCount },
    // Spec 6.4: non-friends (the open-profile teaser tier) don't see what
    // this person is playing.
    nowPlaying: isOpen && lastPlay.live ? lastPlay.last : null,
    genres,
    top4Albums,
    minutesToday,
    joinedAt: user.created_at as string,
  };

  if (isOpen) {
    profile.recentRatings = visibleRatingsList.slice(0, 20).map((r) => ({
      albumId: r.album_id as string,
      stars: Number(r.stars),
      review: r.review as string | null,
      tags: (r.tags as string[] | null) || [],
      createdAt: r.created_at as string,
      isPrivate: !!r.is_private,
      previousStars: null,
    }));
    const { data: friendRows } = await admin
      .from('friendships')
      .select('friend:friend_id(id, name, handle, avatar_url)')
      .eq('user_id', userId);
    profile.friends = (friendRows || [])
      .map((row) => {
        const f = row.friend as unknown as { id: string; name: string; handle: string; avatar_url: string | null } | null;
        return f ? { id: f.id, name: f.name, handle: f.handle, avatarUrl: f.avatar_url } : null;
      })
      .filter((f): f is ApiUser => f !== null);

    if (!isSelf) {
      profile.lastPlayed = lastPlay.last;
      const self: ApiUser = { id: user.id, name: user.name, handle: user.handle, avatarUrl: user.avatar_url };
      const [since, awards] = await Promise.all([
        viewerId
          ? admin.from('friendships').select('created_at').eq('user_id', viewerId).eq('friend_id', userId).maybeSingle()
          : Promise.resolve({ data: null }),
        fetchCircleAwards(admin, userId, profile.friends, self),
      ]);
      profile.friendsSince = (since.data?.created_at as string | undefined) ?? null;
      profile.awards = awards;
    }
  }

  return profile;
}

export async function isFriendOf(admin: SupabaseClient, userId: string, viewerId: string): Promise<boolean> {
  const { data } = await admin
    .from('friendships')
    .select('user_id')
    .eq('user_id', userId)
    .eq('friend_id', viewerId)
    .maybeSingle();
  return !!data;
}

// Same visibility rule as getUserProfile's teaser tier, for the endpoints
// (stats, recap) that expose the same class of data (listening stats,
// top artists/genres) outside the profile page itself.
export async function canViewProfileData(admin: SupabaseClient, targetUserId: string, viewerId: string): Promise<boolean> {
  if (targetUserId === viewerId) return true;
  if (isDemoAccountId(targetUserId)) return true;
  if (await isFriendOf(admin, targetUserId, viewerId)) return true;
  return fetchIsOpenProfile(admin, targetUserId);
}
