import { withSpotifyCache } from './spotifyCache';
import { deezerTopTracks, normalizeTitle } from './deezerServer';
import { fetchArtistAlbumsSplit, fetchSpotifyAlbumDetail, resolveSpotifyAlbumId, type ArtistTopTrack } from './spotifyCatalog';
import { RateLimitError } from './upstreamError';

// The artist page's Popular tab. Spotify's development mode returns 403 for
// /artists/{id}/top-tracks, so the ranking comes from Deezer; each track is
// then matched to its Spotify album and track, because the app opens,
// rates and bookmarks albums by Spotify id. Album ids come from the artist's
// album list when the album is in it (no extra request), else from search;
// both and the album tracklists go through the shared cache. A track whose
// album or title can't be matched is left out.
export async function fetchArtistTopTracks(spotifyArtistId: string, artistName: string): Promise<ArtistTopTrack[]> {
  const top = await deezerTopTracks(artistName);
  if (!top.length) return [];

  const own = await withSpotifyCache(`artistalbums:v1:${spotifyArtistId}`, 12 * 3600, () => fetchArtistAlbumsSplit(spotifyArtistId)).catch(() => null);
  const ownByTitle = new Map((own?.released || []).map((a) => [normalizeTitle(a.title), a.id] as const));

  const albumIdFor = new Map<string, string | null>();
  const out: ArtistTopTrack[] = [];
  for (const tr of top) {
    const key = normalizeTitle(tr.albumTitle);
    try {
      if (!albumIdFor.has(key)) {
        const id = ownByTitle.get(key)
          ?? await withSpotifyCache(`resolve-album:${tr.albumTitle}:${artistName}`, 30 * 86400, () => resolveSpotifyAlbumId(tr.albumTitle, artistName));
        albumIdFor.set(key, id);
      }
      const albumId = albumIdFor.get(key);
      if (!albumId) continue;
      const album = await withSpotifyCache(`album:${albumId}`, 14 * 86400, () => fetchSpotifyAlbumDetail(albumId));
      if (!album) continue;
      const want = normalizeTitle(tr.title);
      const match = album.tracklist.find((t) => normalizeTitle(t.title) === want)
        || album.tracklist.find((t) => { const n = normalizeTitle(t.title); return !!want && (n.startsWith(want) || want.startsWith(n)); });
      if (!match) continue;
      out.push({
        id: match.id,
        title: match.title,
        durationMs: match.durationMs ?? tr.durationMs,
        albumId: album.id,
        albumTitle: album.title,
        albumCover: album.cover ?? tr.albumCover,
        trackNumber: match.trackNumber,
      });
    } catch (err) {
      // A rate limit stops here and keeps what was matched so far; with
      // nothing matched it propagates, so the cache isn't filled with [].
      if (err instanceof RateLimitError) { if (!out.length) throw err; break; }
    }
  }
  return out;
}
