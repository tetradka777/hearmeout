import { getSpotifyAppToken } from './spotifyAppAuth';

async function spotifyGet(path: string, params: Record<string, string>) {
  const token = await getSpotifyAppToken();
  const url = new URL(`https://api.spotify.com/v1${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Spotify request failed (${path}): ${res.status}`);
  return res.json();
}

// Genre bucket -> a plain-text keyword that actually returns on-genre
// results from Spotify search (some canonical genre names, like "hip hop"
// with a space or "rap", return noise — these are the ones that tested
// clean against the live API).
export const GENRE_SEARCH_KEYWORD: Record<string, string> = {
  Rock: 'rock',
  'Hip-Hop': 'hiphop',
  Electronic: 'electronic',
  'R&B': 'r&b',
  Pop: 'pop',
  Latin: 'latin',
};

export type CatalogArtist = { id: string; name: string; photo: string | null };
export type CatalogAlbum = { id: string; title: string; artist: string; artistId: string | null; cover: string | null; spotifyUrl: string; year: number | null };

type SpotifyAlbumSearchItem = {
  id: string;
  name: string;
  artists: { id: string; name: string }[];
  images: { url: string }[];
  external_urls: { spotify: string };
  release_date?: string;
};

function toCatalogAlbum(a: SpotifyAlbumSearchItem): CatalogAlbum {
  return {
    id: a.id,
    title: a.name,
    artist: a.artists.map((x) => x.name).join(', '),
    artistId: a.artists?.[0]?.id ?? null,
    cover: a.images?.[0]?.url ?? null,
    spotifyUrl: a.external_urls.spotify,
    year: a.release_date ? parseInt(a.release_date.slice(0, 4), 10) : null,
  };
}

// Real cover art for our curated catalog, keyed by OUR album id. Batch
// lookup (/v1/albums?ids=) is 403 for this app, so these are singular
// lookups run in parallel — still one Spotify id per catalog album.
export async function fetchAlbumCovers(spotifyIds: { ourId: string; spotifyId: string }[]): Promise<Record<string, string>> {
  const token = await getSpotifyAppToken();
  const results = await Promise.all(
    spotifyIds.map(async ({ ourId, spotifyId }) => {
      try {
        const res = await fetch(`https://api.spotify.com/v1/albums/${spotifyId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return null;
        const data = await res.json();
        const cover = data.images?.[0]?.url as string | undefined;
        return cover ? [ourId, cover] as const : null;
      } catch {
        return null;
      }
    })
  );
  return Object.fromEntries(results.filter((r): r is readonly [string, string] => r !== null));
}

// `market` biases/filters results toward what's actually available in that
// country on Spotify.
function isValidMarket(market?: string | null): market is string {
  return !!market && /^[A-Z]{2}$/.test(market);
}

// Real top artists per genre bucket, via the genre: search field filter.
export async function fetchGenreTopArtists(genreBucket: string, limit = 8, market?: string | null): Promise<CatalogArtist[]> {
  const keyword = GENRE_SEARCH_KEYWORD[genreBucket] ?? genreBucket.toLowerCase();
  const params: Record<string, string> = { q: `genre:${keyword}`, type: 'artist', limit: String(limit) };
  if (isValidMarket(market)) params.market = market;
  const data = await spotifyGet('/search', params);
  return (data.artists?.items || []).map((a: { id: string; name: string; images: { url: string }[] }) => ({
    id: a.id,
    name: a.name,
    photo: a.images?.[0]?.url ?? null,
  }));
}

// "Малоизвестные исполнители": Spotify doesn't expose a monthly-listeners
// field over the public API, so this uses tag:hipster — Spotify's own
// bottom-10%-popularity search filter — as the closest real substitute.
export async function fetchObscureAlbums(genreBucket: string, limit = 10, market?: string | null): Promise<CatalogAlbum[]> {
  const keyword = GENRE_SEARCH_KEYWORD[genreBucket] ?? genreBucket.toLowerCase();
  const params: Record<string, string> = { q: `tag:hipster ${keyword}`, type: 'album', limit: String(limit) };
  if (isValidMarket(market)) params.market = market;
  const data = await spotifyGet('/search', params);
  return (data.albums?.items || []).map(toCatalogAlbum);
}

// Resolves an arbitrary title/artist pair (e.g. a MusicBrainz release group
// that has no Spotify id of its own) to a real Spotify album id, so results
// from non-Spotify sources (library search, an artist's MusicBrainz
// discography) can still open a real album page instead of being a dead
// click. limit=1 dodges the "Invalid limit" cap confirmed on this app's tier.
export async function resolveSpotifyAlbumId(title: string, artist: string): Promise<string | null> {
  const params: Record<string, string> = { q: `album:${title} artist:${artist}`, type: 'album', limit: '1' };
  const data = await spotifyGet('/search', params);
  return data.albums?.items?.[0]?.id ?? null;
}

// Resolves a catalog artist name (our curated albums only know the artist's
// name, not their Spotify id) to a real Spotify artist id, so Discover's
// artist search results can open a real artist page instead of a dead click.
export async function resolveSpotifyArtistId(name: string): Promise<string | null> {
  const params: Record<string, string> = { q: `artist:${name}`, type: 'artist', limit: '1' };
  const data = await spotifyGet('/search', params);
  return data.artists?.items?.[0]?.id ?? null;
}

export type AlbumTrack = { id: string; title: string; trackNumber: number };
export type AlbumDetail = {
  id: string;
  title: string;
  cover: string | null;
  year: number | null;
  releaseDate: string | null;
  artist: string;
  artistId: string | null;
  tracklist: AlbumTrack[];
};

// Full album detail incl. tracklist — Spotify returns the first page of
// tracks embedded directly in the album response, no second request needed.
export async function fetchSpotifyAlbumDetail(id: string): Promise<AlbumDetail | null> {
  const token = await getSpotifyAppToken();
  const res = await fetch(`https://api.spotify.com/v1/albums/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  // A 404 means the album genuinely doesn't exist on Spotify — safe to cache
  // as "not found". Anything else (429 rate limit, 5xx, auth hiccups) is
  // transient and must throw, so the caller's cache falls back to stale data
  // instead of locking in a false "not found" for a full day.
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Spotify request failed (/albums/${id}): ${res.status}`);
  const a = await res.json();
  return {
    id: a.id,
    title: a.name,
    cover: a.images?.[0]?.url ?? null,
    year: a.release_date ? parseInt(a.release_date.slice(0, 4), 10) : null,
    releaseDate: a.release_date ?? null,
    artist: (a.artists || []).map((x: { name: string }) => x.name).join(', '),
    artistId: a.artists?.[0]?.id ?? null,
    tracklist: (a.tracks?.items || []).map((t: { id: string; name: string; track_number: number }) => ({
      id: t.id,
      title: t.name,
      trackNumber: t.track_number,
    })),
  };
}

export type ArtistDetail = {
  id: string;
  name: string;
  photo: string | null;
  genres: string[];
  followers: number | null;
  popularity: number | null;
};

// Spotify's public API has no "monthly listeners" field — followers/popularity
// are the only real popularity signals it exposes for an artist.
export async function fetchSpotifyArtistDetail(id: string): Promise<ArtistDetail | null> {
  const token = await getSpotifyAppToken();
  const res = await fetch(`https://api.spotify.com/v1/artists/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Spotify request failed (/artists/${id}): ${res.status}`);
  const a = await res.json();
  return {
    id: a.id,
    name: a.name,
    photo: a.images?.[0]?.url ?? null,
    genres: a.genres || [],
    followers: a.followers?.total ?? null,
    popularity: a.popularity ?? null,
  };
}

export type SpotifyArtistAlbumRef = { id: string; title: string; cover: string | null; releaseDate: string | null; year: number | null };

// Split into released vs. upcoming (pre-announced future release_date) —
// Spotify does include not-yet-released albums here once an artist/label
// has published the listing, with a future release_date.
export async function fetchArtistAlbumsSplit(id: string): Promise<{ released: SpotifyArtistAlbumRef[]; upcoming: SpotifyArtistAlbumRef[] }> {
  const token = await getSpotifyAppToken();
  // limit is capped at 10 for this app's access tier — anything higher
  // (up to Spotify's documented max of 50) gets a bare 400 "Invalid limit"
  // with no other indication why, confirmed by hand against this app's
  // actual credentials.
  const res = await fetch(`https://api.spotify.com/v1/artists/${id}/albums?include_groups=album,single&limit=10`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 404) return { released: [], upcoming: [] };
  if (!res.ok) throw new Error(`Spotify request failed (/artists/${id}/albums): ${res.status}`);
  const data = await res.json();
  const today = new Date().toISOString().slice(0, 10);
  const seen = new Set<string>();
  const released: SpotifyArtistAlbumRef[] = [];
  const upcoming: SpotifyArtistAlbumRef[] = [];
  for (const a of data.items || []) {
    const dedupeKey = `${a.name}__${a.release_date}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    const ref: SpotifyArtistAlbumRef = {
      id: a.id,
      title: a.name,
      cover: a.images?.[0]?.url ?? null,
      releaseDate: a.release_date ?? null,
      year: a.release_date ? parseInt(a.release_date.slice(0, 4), 10) : null,
    };
    if (a.release_date && a.release_date > today) upcoming.push(ref);
    else released.push(ref);
  }
  released.sort((a, b) => (b.releaseDate || '').localeCompare(a.releaseDate || ''));
  upcoming.sort((a, b) => (a.releaseDate || '').localeCompare(b.releaseDate || ''));
  return { released, upcoming };
}

export type ArtistTopTrack = { id: string; title: string; durationMs: number; albumId: string; albumTitle: string; albumCover: string | null; trackNumber: number };

// The artist page's Popular tab (spec 6.7). Spotify requires a market for
// top tracks; the account's region when it's a valid code, else US.
export async function fetchArtistTopTracks(id: string, market?: string | null): Promise<ArtistTopTrack[]> {
  const token = await getSpotifyAppToken();
  const res = await fetch(`https://api.spotify.com/v1/artists/${id}/top-tracks?market=${isValidMarket(market) ? market : 'US'}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`Spotify request failed (/artists/${id}/top-tracks): ${res.status}`);
  const data = await res.json();
  return (data.tracks || []).slice(0, 10).map((tr: { id: string; name: string; duration_ms: number; track_number: number; album: { id: string; name: string; images?: { url: string }[] } }) => ({
    id: tr.id,
    title: tr.name,
    durationMs: tr.duration_ms,
    albumId: tr.album.id,
    albumTitle: tr.album.name,
    albumCover: tr.album.images?.[0]?.url ?? null,
    trackNumber: tr.track_number,
  }));
}
