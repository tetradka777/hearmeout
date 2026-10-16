import { withSpotifyCache } from './spotifyCache';
import { deezerArtistFor, deezerTopTracksById, normalizeTitle } from './deezerServer';
import { fetchArtistAlbumsSplit, fetchSpotifyAlbumDetail, resolveArtistAlbumId, type ArtistTopTrack } from './spotifyCatalog';
import { RateLimitError } from './upstreamError';

// The artist page's Popular tab. Spotify's development mode returns 403 for
// /artists/{id}/top-tracks, so the ranking comes from Deezer; each track is
// then matched to its Spotify album and track, because the app opens,
// rates and bookmarks albums by Spotify id. Album ids come from the artist's
// album list when the album is in it (no extra request), else from a search
// limited to albums crediting the artist (never a cover album);
// both and the album tracklists go through the shared cache. A track whose
// album or title can't be matched is left out.
export async function fetchArtistTopTracks(spotifyArtistId: string, artistName: string): Promise<ArtistTopTrack[]> {
  const own = await withSpotifyCache(`artistalbums:v1:${spotifyArtistId}`, 86400, () => fetchArtistAlbumsSplit(spotifyArtistId)).catch(() => null);
  // The Deezer artist must be this one, not a namesake (deezerArtistFor).
  const dz = await deezerArtistFor(spotifyArtistId, artistName, own ? [...own.released, ...own.upcoming].map((a) => a.title) : []);
  const top = dz ? await deezerTopTracksById(dz.id) : [];
  if (!top.length) return latestReleaseTracks(spotifyArtistId, artistName, own?.released || []);
  const ownByTitle = new Map((own?.released || []).map((a) => [normalizeTitle(a.title), a.id] as const));

  const albumIdFor = new Map<string, string | null>();
  const out: ArtistTopTrack[] = [];
  for (const tr of top) {
    const key = normalizeTitle(tr.albumTitle);
    try {
      if (!albumIdFor.has(key)) {
        const id = ownByTitle.get(key)
          ?? await withSpotifyCache(`resolve-artist-album:v1:${spotifyArtistId}:${key}`, 30 * 86400, () => resolveArtistAlbumId(tr.albumTitle, artistName, spotifyArtistId, normalizeTitle));
        albumIdFor.set(key, id);
      }
      const albumId = albumIdFor.get(key);
      if (!albumId) continue;
      const album = await withSpotifyCache(`album:${albumId}`, 14 * 86400, () => fetchSpotifyAlbumDetail(albumId));
      // Only the artist's own releases: never a cover or tribute album.
      if (!album || (album.artistId !== spotifyArtistId && normalizeTitle(album.artist) !== normalizeTitle(artistName))) continue;
      const want = normalizeTitle(tr.title);
      const match = album.tracklist.find((t) => normalizeTitle(t.title) === want)
        || album.tracklist.find((t) => { const n = normalizeTitle(t.title); return !!want && (n.startsWith(want) || want.startsWith(n)); });
      if (!match || out.some((o) => o.id === match.id)) continue;
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
      // A rate limit propagates: a half-matched list mustn't be cached for
      // a day (the route answers with Deezer's list meanwhile).
      if (err instanceof RateLimitError) throw err;
    }
  }
  return out.length ? out : latestReleaseTracks(spotifyArtistId, artistName, own?.released || []);
}

// An artist too small for Deezer's ranking (or not on Deezer): the lead
// track of each of their latest releases on Spotify, newest first.
async function latestReleaseTracks(spotifyArtistId: string, artistName: string, released: { id: string }[]): Promise<ArtistTopTrack[]> {
  const out: ArtistTopTrack[] = [];
  for (const ref of released.slice(0, 8)) {
    const album = await withSpotifyCache(`album:${ref.id}`, 14 * 86400, () => fetchSpotifyAlbumDetail(ref.id));
    if (!album || (album.artistId !== spotifyArtistId && normalizeTitle(album.artist) !== normalizeTitle(artistName))) continue;
    const first = album.tracklist[0];
    if (!first || out.some((o) => o.id === first.id || normalizeTitle(o.title) === normalizeTitle(first.title))) continue;
    out.push({
      id: first.id,
      title: first.title,
      durationMs: first.durationMs ?? 0,
      albumId: album.id,
      albumTitle: album.title,
      albumCover: album.cover,
      trackNumber: first.trackNumber,
    });
  }
  return out;
}

// Deezer's ranking alone, for while Spotify is rate-limiting the app: the
// tracks play (previews come from Deezer) but have no Spotify album, so the
// page can't open, rate or bookmark them. Only a Deezer artist that is
// surely this one (compared with whatever album titles are cached).
export async function deezerOnlyTopTracks(spotifyArtistId: string, artistName: string, albumTitles: string[]): Promise<ArtistTopTrack[]> {
  const dz = await deezerArtistFor(spotifyArtistId, artistName, albumTitles);
  const top = dz ? await deezerTopTracksById(dz.id) : [];
  return top.map((tr, i) => ({
    id: `dz-${i}-${normalizeTitle(tr.title)}`,
    title: tr.title,
    durationMs: tr.durationMs,
    albumId: '',
    albumTitle: tr.albumTitle,
    albumCover: tr.albumCover,
    trackNumber: 0,
  }));
}
