import type { SupabaseClient } from '@supabase/supabase-js';
import { getSpotifyAppToken } from './spotifyAppAuth';
import { deezerArtistByName, deezerArtistGenres, normalizeTitle } from './deezerServer';
import { bucketForGenres } from './genreBuckets';
import { fetchAllRows } from './supabasePaginate';
import { RateLimitError } from './upstreamError';

// The Extended Streaming History export has real spotify_track_uri values
// and album names, but no cover art, album/artist id or genre —
// importStreamingHistory stores those as null. This fills them in, newest
// plays first, a bounded amount per run; runs after an import and after
// every sync (lib/autoSync), so a big history fills in over a few runs.
//
// - Covers: one /v1/tracks/{id} lookup per ALBUM (album name + artist), and
//   the cover/album id goes into every row of that album — a 20k-play
//   history has far fewer albums than tracks.
// - Genres: Deezer genres per main artist (cached 30 days), stored as the
//   catalog bucket like everywhere else, so taste match counts them.
//
// Spotify lookups run one at a time with a delay, and a 429 stops the whole
// run: an earlier version that ran 8 at once got an 11-hour penalty that
// broke album and artist pages app-wide.
const REQUEST_DELAY_MS = 150;
const MAX_ALBUMS_PER_RUN = 300;
const MAX_ARTISTS_PER_RUN = 200;

// One run per user at a time (a manual sync and the background sync can
// overlap).
const runningFor = new Set<string>();

type Row = { track_id: string | null; album: string | null; artist: string | null; cover_url: string | null; genre: string | null };

export async function enrichListeningHistoryCovers(admin: SupabaseClient, userId: string): Promise<void> {
  if (runningFor.has(userId)) return;
  runningFor.add(userId);
  try {
    await enrich(admin, userId);
  } finally {
    runningFor.delete(userId);
  }
}

async function enrich(admin: SupabaseClient, userId: string): Promise<void> {
  const { rows } = await fetchAllRows<Row>((f, t) => admin
    .from('listening_events')
    .select('track_id, album, artist, cover_url, genre')
    .eq('user_id', userId)
    .or('cover_url.is.null,genre.is.null')
    .order('played_at', { ascending: false })
    .range(f, t));
  if (!rows.length) return;

  // Covers: newest albums first, one track per album.
  const albums = new Map<string, { album: string | null; artist: string; trackId: string }>();
  for (const r of rows) {
    if (r.cover_url || !r.track_id || !r.artist) continue;
    const key = `${r.album ?? ''}\u0000${r.artist}`;
    if (!albums.has(key)) albums.set(key, { album: r.album, artist: r.artist, trackId: r.track_id });
  }
  const token = albums.size ? await getSpotifyAppToken() : '';
  let n = 0;
  for (const a of albums.values()) {
    if (n++ >= MAX_ALBUMS_PER_RUN) break;
    try {
      const res = await fetch(`https://api.spotify.com/v1/tracks/${a.trackId}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 429) break; // shared token is rate-limited — stop, don't make it worse
      if (res.ok) {
        const data = await res.json();
        const patch = {
          cover_url: (data.album?.images?.[0]?.url as string | undefined) ?? null,
          album_id: (data.album?.id as string | undefined) ?? null,
          artist_id: (data.artists?.[0]?.id as string | undefined) ?? null,
          release_year: data.album?.release_date ? parseInt(String(data.album.release_date).slice(0, 4), 10) : null,
        };
        if (patch.cover_url || patch.album_id) {
          let q = admin.from('listening_events').update(patch).eq('user_id', userId).eq('artist', a.artist).is('cover_url', null);
          q = a.album == null ? q.eq('track_id', a.trackId) : q.eq('album', a.album);
          await q;
        }
      }
    } catch {
      // best-effort — one bad album shouldn't stop the rest of the run
    }
    await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS));
  }

  // Genres: by the row's artist string, genre from its main artist. Synced
  // rows join several artists with ", ", but a name can contain a comma too
  // ("Tyler, The Creator"): the whole string wins when Deezer knows it.
  const artists = [...new Set(rows.filter((r) => !r.genre && r.artist).map((r) => r.artist as string))].slice(0, MAX_ARTISTS_PER_RUN);
  for (const artist of artists) {
    try {
      const whole = artist.includes(',') ? await deezerArtistByName(artist) : null;
      const main = whole && normalizeTitle(whole.name) === normalizeTitle(artist) ? artist : artist.split(',')[0].trim();
      const genres = await deezerArtistGenres(main);
      const genre = bucketForGenres(genres) ?? genres[0];
      if (genre) await admin.from('listening_events').update({ genre }).eq('user_id', userId).eq('artist', artist).is('genre', null);
    } catch (err) {
      if (err instanceof RateLimitError) break;
    }
  }
}
