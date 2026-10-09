import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchRecentlyPlayed, refreshAccessToken } from './spotify';
import { deezerArtistGenres } from './deezerServer';
import { bucketForGenres } from './genreBuckets';
import { RateLimitError } from './upstreamError';
import { detectRegionFromSpotify } from './regionDetect';

export async function syncSpotifyForUser(admin: SupabaseClient, userId: string): Promise<{ imported: number }> {
  const { data: conn, error: connErr } = await admin
    .from('connections')
    .select('*')
    .eq('user_id', userId)
    .eq('provider', 'spotify')
    .maybeSingle();
  if (connErr) throw connErr;
  if (!conn) throw new Error('not_connected');

  let accessToken = conn.access_token as string;
  const expiresAt = new Date(conn.expires_at as string).getTime();
  if (Date.now() > expiresAt - 60_000) {
    const refreshed = await refreshAccessToken(conn.refresh_token as string);
    accessToken = refreshed.access_token;
    const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
    await admin
      .from('connections')
      .update({
        access_token: accessToken,
        refresh_token: refreshed.refresh_token || conn.refresh_token,
        expires_at: newExpiresAt,
      })
      .eq('user_id', userId)
      .eq('provider', 'spotify');
  }

  // Keep the account country current for "Detect from my streaming account".
  await detectRegionFromSpotify(admin, userId, accessToken);
  const items = await fetchRecentlyPlayed(accessToken);
  if (!items.length) return { imported: 0 };

  // Recently played tracks don't carry a genre, and Spotify no longer gives
  // development-mode apps artist genres, so each main artist's genre comes
  // from Deezer by name (cached for 30 days, so a sync usually costs nothing).
  // Stored as the catalog bucket (Rock, Hip-Hop, …) when one fits: taste
  // match compares genre names, and everyone else's are buckets.
  const genreByArtist = new Map<string, string>();
  for (const name of [...new Set(items.map((i) => i.track.artists[0]?.name).filter(Boolean))]) {
    try {
      const genres = await deezerArtistGenres(name);
      const genre = bucketForGenres(genres) ?? genres[0];
      if (genre) genreByArtist.set(name, genre);
    } catch (err) {
      if (err instanceof RateLimitError) break;
    }
  }

  const rows = items.map((i) => ({
    user_id: userId,
    track_id: i.track.id,
    track_title: i.track.name,
    artist: i.track.artists.map((a) => a.name).join(', '),
    artist_id: i.track.artists[0]?.id || null,
    album: i.track.album.name,
    album_id: i.track.album.id,
    cover_url: i.track.album.images?.[0]?.url || null,
    genre: genreByArtist.get(i.track.artists[0]?.name) || null,
    release_year: i.track.album.release_date ? parseInt(i.track.album.release_date.slice(0, 4), 10) : null,
    // Whole seconds, like the Extended Streaming History import, so the
    // unique (user, track, played_at) key catches a play that's in both.
    played_at: new Date(Math.floor(new Date(i.played_at).getTime() / 1000) * 1000).toISOString(),
    duration_ms: i.track.duration_ms,
    source: 'spotify' as const,
  }));

  const { error: insertErr } = await admin
    .from('listening_events')
    .upsert(rows, { onConflict: 'user_id,track_id,played_at', ignoreDuplicates: true });
  if (insertErr) throw insertErr;

  return { imported: rows.length };
}
