import type { ApiUser, FeedFriendRepeatTrack, FeedRepeatTrack } from './types';

export type RepeatPlay = {
  // feed_raw's existing my_session omits track_id; keep its fallback identity.
  track_id?: string | null;
  track_title: string | null;
  artist: string | null;
  album_id: string | null;
  cover_url: string | null;
  played_at: string;
};

// Counts only the already-loaded events in the viewer's local day. These
// are observed plays, not estimates of a listener's all-time favourites.
export function aggregateRepeatTracks(rows: readonly RepeatPlay[], limit = 10): FeedRepeatTrack[] {
  const tracks = new Map<string, FeedRepeatTrack>();
  for (const row of [...rows].sort((a, b) => Date.parse(b.played_at) - Date.parse(a.played_at))) {
    if (!row.track_title?.trim()) continue;
    const key = row.track_id
      ? JSON.stringify(['id', row.track_id])
      : JSON.stringify(['metadata', row.track_title, row.artist || '', row.album_id || '']);
    const existing = tracks.get(key);
    if (existing) {
      existing.plays += 1;
      // Never pair an older edition's cover with the most recent album id.
      if (!existing.cover && existing.albumId === row.album_id) existing.cover = row.cover_url || null;
    } else {
      tracks.set(key, {
        trackId: row.track_id || null, title: row.track_title, artist: row.artist || '',
        albumId: row.album_id || null, cover: row.cover_url || null, plays: 1, at: row.played_at,
      });
    }
  }
  return [...tracks.values()].filter((track) => track.plays >= 2)
    .sort((a, b) => b.plays - a.plays || Date.parse(b.at) - Date.parse(a.at))
    .slice(0, Math.max(0, limit));
}

export function aggregateFriendsOnRepeat(
  rows: readonly (RepeatPlay & { user_id: string })[],
  users: ReadonlyMap<string, ApiUser>,
  canShare: (userId: string) => boolean,
  viewerId: string,
  limit = 10,
): FeedFriendRepeatTrack[] {
  const byFriend = new Map<string, RepeatPlay[]>();
  for (const row of rows) {
    if (row.user_id === viewerId || !users.has(row.user_id) || !canShare(row.user_id)) continue;
    const plays = byFriend.get(row.user_id) || [];
    plays.push(row);
    byFriend.set(row.user_id, plays);
  }
  return [...byFriend].flatMap(([id, plays]) =>
    aggregateRepeatTracks(plays, limit).map((track) => ({ ...track, user: users.get(id)! })))
    .sort((a, b) => b.plays - a.plays || Date.parse(b.at) - Date.parse(a.at))
    .slice(0, Math.max(0, limit));
}
