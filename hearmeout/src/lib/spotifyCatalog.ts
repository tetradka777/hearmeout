import { getSpotifyAppToken } from './spotifyAppAuth';
import { bucketForGenres } from './genreBuckets';
import { deezerArtistFor, deezerArtistGenres, deezerGenresById, normalizeTitle } from './deezerServer';
import { withSpotifyCache } from './spotifyCache';
import { RateLimitError, retryAfterSeconds } from './upstreamError';
import { logServerError } from './errorLog';
import { supabaseAdmin } from './supabaseAdmin';
import { isBackground } from './spotifyPriority';

// Every Spotify Web API call goes through here: a 429 with a short
// Retry-After (2 s or less) is waited out and retried once; a longer one
// throws RateLimitError so routes can answer 503 + Retry-After and the
// shared cache can fall back to stale data. After a long 429 every call
// fails fast until Retry-After has passed: requests sent while limited
// still count against the quota and stretch the penalty. The block is also
// stored in the database (spotify_cache, key BLOCK_KEY), so a restarted
// server (every deploy) doesn't knock on Spotify again mid-penalty — it
// used to, every 20 minutes, during a 7-hour block.
let blockedUntil = 0;
const BLOCK_KEY = 'sp-blocked-until';
let blockLoaded: Promise<void> | null = null;

function loadBlock(): Promise<void> {
  blockLoaded ??= (async () => {
    try {
      const { data } = await supabaseAdmin().from('spotify_cache').select('payload').eq('key', BLOCK_KEY).maybeSingle();
      const until = Number((data?.payload as { until?: number } | null)?.until);
      if (Number.isFinite(until)) blockedUntil = Math.max(blockedUntil, until);
    } catch { /* no stored block */ }
  })();
  return blockLoaded;
}

// Requests are also paced for the whole server (every visitor shares the
// app's quota): at most MAX_IN_WINDOW per WINDOW_MS, of which background
// work (lib/spotifyPriority) may use only MAX_BACKGROUND, so pages people
// have open always have room. A burst queues for a moment instead of
// tipping the app into a long penalty.
const WINDOW_MS = 30_000;
const MAX_IN_WINDOW = 40;
const MAX_BACKGROUND = 10;
const sent: number[] = [];

async function slot(): Promise<void> {
  await loadBlock();
  const cap = isBackground() ? MAX_BACKGROUND : MAX_IN_WINDOW;
  for (;;) {
    if (Date.now() < blockedUntil) throw new RateLimitError(Math.ceil((blockedUntil - Date.now()) / 1000));
    const now = Date.now();
    while (sent.length && now - sent[0] >= WINDOW_MS) sent.shift();
    if (sent.length < cap) { sent.push(now); return; }
    await new Promise((r) => setTimeout(r, WINDOW_MS - (now - sent[0]) + 20));
  }
}

function block(res: Response, url: string): RateLimitError {
  const wait = retryAfterSeconds(res, 30);
  // Logged once per penalty, with the request that hit it, so the error log
  // shows how long Spotify blocked the app and what was asking.
  if (Date.now() >= blockedUntil) logServerError('spotify rate limit', new Error(`429, retry after ${wait} s${isBackground() ? ' (background)' : ''}: ${url.replace('https://api.spotify.com/v1', '').slice(0, 120)}`));
  blockedUntil = Math.max(blockedUntil, Date.now() + wait * 1000);
  const until = blockedUntil;
  void supabaseAdmin().from('spotify_cache').upsert({
    key: BLOCK_KEY,
    payload: { until },
    fetched_at: new Date().toISOString(),
    expires_at: new Date(until).toISOString(),
  }).then(() => {}, () => {});
  return new RateLimitError(wait);
}

// Is Spotify blocking the app right now (so a caller can go straight to a
// fallback instead of waiting)?
export function spotifyBlocked(): boolean {
  return Date.now() < blockedUntil;
}

async function spotifyFetch(input: string | URL, init?: RequestInit): Promise<Response> {
  await slot();
  let res = await fetch(input, init);
  if (res.status === 429) {
    const wait = retryAfterSeconds(res, 30);
    if (wait > 2) throw block(res, String(input));
    await new Promise((r) => setTimeout(r, wait * 1000));
    res = await fetch(input, init);
    if (res.status === 429) throw block(res, String(input));
  }
  return res;
}

async function spotifyGet(path: string, params: Record<string, string>) {
  const token = await getSpotifyAppToken();
  const url = new URL(`https://api.spotify.com/v1${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await spotifyFetch(url, { headers: { Authorization: `Bearer ${token}` } });
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

type SpotifyAlbumSearchItem = {
  id: string;
  name: string;
  artists: { id: string; name: string }[];
  images: { url: string }[];
  external_urls: { spotify: string };
  release_date?: string;
};

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

// White/brown noise, sleep, relaxation, study and similar "functional"
// audio: not music anyone rates.
export function isFunctionalAudio(title: string, artist: string): boolean {
  return /\b(white|brown|pink|green) noise\b|\bnoise (for|machine)\b|\bsleep (music|sounds|aid)\b|\bdeep sleep\b|\bfor sleep(ing)?\b|\brelax(ing|ation)\b|meditat|lullab|\basmr\b|rain sounds|nature sounds|ocean waves|binaural|solfeggio|\b\d+ ?hz\b|\bstudy (music|beats)\b|focus music|spa music|\byoga\b|calm(ing)? music|loops for|\bbaby (music|sleep)\b/i.test(`${title} ${artist}`);
}

// Resolves an arbitrary title/artist pair (e.g. a MusicBrainz release group
// that has no Spotify id of its own) to a real Spotify album id, so results
// from non-Spotify sources (library search, an artist's MusicBrainz
// discography) can still open a real album page instead of being a dead
// click. limit=1 dodges the "Invalid limit" cap confirmed on this app's tier.
//
// Only an album that credits an artist with exactly this name (any of the
// credited artists, or the main one of "A & B" / "A, B") and has this title
// (ignoring "(Deluxe)", "- Remastered" and the like) — no match is null,
// never the first search hit, which used to open someone else's album.
export async function resolveSpotifyAlbumId(title: string, artist: string): Promise<string | null> {
  const params: Record<string, string> = { q: `album:${title} artist:${artist}`, type: 'album', limit: '10' };
  const data = await spotifyGet('/search', params);
  const items = (data.albums?.items || []) as SpotifyAlbumSearchItem[];
  const wantArtists = new Set([artist, ...artist.split(/\s*,\s*|\s+&\s+/)].map(normalizeTitle).filter(Boolean));
  const wantTitle = normalizeTitle(title);
  const byArtist = items.filter((a) => a.artists?.some((x) => wantArtists.has(normalizeTitle(x.name))));
  const hit = byArtist.find((a) => normalizeTitle(a.name) === wantTitle)
    || byArtist.find((a) => { const n = normalizeTitle(a.name); return !!wantTitle && !!n && (n.startsWith(wantTitle) || wantTitle.startsWith(n)); });
  return hit?.id ?? null;
}

// An album of this artist by title: search results (at most 10 in
// development mode) narrowed to albums that credit the artist, so a cover
// or tribute album with the same name never wins; an exact title first.
export async function resolveArtistAlbumId(title: string, artistName: string, artistId: string, normalize: (s: string) => string): Promise<string | null> {
  const data = await spotifyGet('/search', { q: `album:${title} artist:${artistName}`, type: 'album', limit: '10' });
  const items = ((data.albums?.items || []) as SpotifyAlbumSearchItem[]).filter((a) => a.artists?.some((x) => x.id === artistId));
  const want = normalize(title);
  return (items.find((a) => normalize(a.name) === want)
    || items.find((a) => { const n = normalize(a.name); return !!want && !!n && (n.startsWith(want) || want.startsWith(n)); }))?.id ?? null;
}

// Resolves a catalog artist name (our curated albums only know the artist's
// name, not their Spotify id) to a real Spotify artist id, so Discover's
// artist search results can open a real artist page instead of a dead click.
export async function resolveSpotifyArtistId(name: string): Promise<string | null> {
  // The artist with exactly this name wins over a better known one whose
  // name merely contains it ("miley" isn't Miley Cyrus).
  const params: Record<string, string> = { q: `artist:${name}`, type: 'artist', limit: '10' };
  const data = await spotifyGet('/search', params);
  const items: { id: string; name: string }[] = data.artists?.items ?? [];
  // Exactly this name or nobody: the first hit used to be returned when
  // nothing matched, which opened the wrong artist's page.
  const want = normalizeTitle(name);
  return items.find((a) => normalizeTitle(a.name) === want)?.id ?? null;
}

// durationMs is optional: details cached before it was added lack it.
export type AlbumTrack = { id: string; title: string; trackNumber: number; durationMs?: number | null };
export type AlbumDetail = {
  id: string;
  title: string;
  cover: string | null;
  year: number | null;
  releaseDate: string | null;
  artist: string;
  artistId: string | null;
  tracklist: AlbumTrack[];
  // Catalog genre bucket (lib/genreBuckets.ts) from the main artist's
  // Spotify genres — albums themselves almost never carry genres. Older
  // cached details (spotify_cache) may lack it.
  genreBucket?: string | null;
};

// Full album detail incl. tracklist — Spotify returns the first page of
// tracks embedded directly in the album response, no second request needed.
export async function fetchSpotifyAlbumDetail(id: string): Promise<AlbumDetail | null> {
  const token = await getSpotifyAppToken();
  const res = await spotifyFetch(`https://api.spotify.com/v1/albums/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  // A 404 means the album genuinely doesn't exist on Spotify — safe to cache
  // as "not found". Anything else (429 rate limit, 5xx, auth hiccups) is
  // transient and must throw, so the caller's cache falls back to stale data
  // instead of locking in a false "not found" for a full day.
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Spotify request failed (/albums/${id}): ${res.status}`);
  const a = await res.json();
  // Spotify no longer returns artist genres to development-mode apps, so
  // the bucket comes from the main artist's Deezer genres; a failure just
  // leaves the album without a bucket rather than failing the album.
  const mainArtist: string | undefined = a.artists?.[0]?.name;
  const artistGenres = mainArtist ? await deezerArtistGenres(mainArtist).catch(() => [] as string[]) : [];
  return {
    id: a.id,
    title: a.name,
    cover: a.images?.[0]?.url ?? null,
    year: a.release_date ? parseInt(a.release_date.slice(0, 4), 10) : null,
    releaseDate: a.release_date ?? null,
    genreBucket: bucketForGenres([...(a.genres || []), ...artistGenres]),
    artist: (a.artists || []).map((x: { name: string }) => x.name).join(', '),
    artistId: a.artists?.[0]?.id ?? null,
    tracklist: (a.tracks?.items || []).map((t: { id: string; name: string; track_number: number; duration_ms?: number }) => ({
      id: t.id,
      title: t.name,
      trackNumber: t.track_number,
      durationMs: t.duration_ms ?? null,
    })),
  };
}

export type ArtistDetail = {
  id: string;
  name: string;
  photo: string | null;
  genres: string[];
  // Deezer fans: Spotify no longer returns followers, popularity or genres
  // to development-mode apps, so these two come from Deezer by name.
  fans: number | null;
};

// Just the name, for lookups keyed by artist id (no Deezer calls).
export async function fetchSpotifyArtistName(id: string): Promise<string | null> {
  const token = await getSpotifyAppToken();
  const res = await spotifyFetch(`https://api.spotify.com/v1/artists/${id}`, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 404 || res.status === 400) return null;
  if (!res.ok) throw new Error(`Spotify request failed (/artists/${id}): ${res.status}`);
  return (await res.json()).name ?? null;
}

export async function fetchSpotifyArtistDetail(id: string): Promise<ArtistDetail | null> {
  const token = await getSpotifyAppToken();
  const res = await spotifyFetch(`https://api.spotify.com/v1/artists/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Spotify request failed (/artists/${id}): ${res.status}`);
  const a = await res.json();
  // Deezer's artist only when its albums match this artist's (namesakes).
  const albums = await withSpotifyCache(`artistalbums:v1:${id}`, 86400, () => fetchArtistAlbumsSplit(id)).catch(() => null);
  const titles = albums ? [...albums.released, ...albums.upcoming].map((al) => al.title) : [];
  const dz = await deezerArtistFor(id, a.name, titles).catch(() => null);
  const genres = dz ? await deezerGenresById(dz.id).catch(() => [] as string[]) : [];
  return {
    id: a.id,
    name: a.name,
    photo: a.images?.[0]?.url ?? dz?.photo ?? null,
    genres,
    fans: dz?.fans ?? null,
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
  const res = await spotifyFetch(`https://api.spotify.com/v1/artists/${id}/albums?include_groups=album,single&limit=10`, {
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


// A track's ISRC, the recording code that's the same on every service (the
// preview player finds the exact recording on Deezer by it). Single-track
// lookups still work in development mode; album track lists don't carry it.
export async function fetchSpotifyTrackIsrc(id: string): Promise<string | null> {
  const token = await getSpotifyAppToken();
  const res = await spotifyFetch(`https://api.spotify.com/v1/tracks/${id}`, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 404 || res.status === 400) return null;
  if (!res.ok) throw new Error(`Spotify request failed (/tracks/${id}): ${res.status}`);
  const t = await res.json();
  return (t.external_ids?.isrc as string | undefined) ?? null;
}

// The album side of a track (for filling in imported listening history):
// cover, album and artist ids, release year. Null for a track Spotify
// doesn't know (local files, removed tracks).
export type TrackAlbumInfo = { cover: string | null; albumId: string | null; artistId: string | null; year: number | null };
export async function fetchSpotifyTrackAlbum(id: string): Promise<TrackAlbumInfo | null> {
  const token = await getSpotifyAppToken();
  const res = await spotifyFetch(`https://api.spotify.com/v1/tracks/${id}`, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 404 || res.status === 400) return null;
  if (!res.ok) throw new Error(`Spotify request failed (/tracks/${id}): ${res.status}`);
  const data = await res.json();
  return {
    cover: (data.album?.images?.[0]?.url as string | undefined) ?? null,
    albumId: (data.album?.id as string | undefined) ?? null,
    artistId: (data.artists?.[0]?.id as string | undefined) ?? null,
    year: data.album?.release_date ? parseInt(String(data.album.release_date).slice(0, 4), 10) : null,
  };
}

// Track search by artist and title; the caller decides which hit (if any)
// really is the track.
export async function searchSpotifyTracks(artist: string, title: string): Promise<{ id: string; title: string; artists: string[] }[]> {
  const token = await getSpotifyAppToken();
  const q = encodeURIComponent(`track:${title} artist:${artist}`);
  const res = await spotifyFetch(`https://api.spotify.com/v1/search?type=track&limit=10&q=${q}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Spotify request failed (/search track): ${res.status}`);
  const data = await res.json();
  return (data.tracks?.items || []).map((t: { id: string; name: string; artists?: { name: string }[] }) => ({
    id: t.id, title: t.name, artists: (t.artists || []).map((a) => a.name),
  }));
}

// An artist's photo for the small avatars next to names. By Spotify id when
// it's known (exact); otherwise the Spotify artist whose name is exactly
// this one — never a merely similar name, so a small artist doesn't get a
// famous one's face. null when there's no such artist or no picture.
export async function fetchSpotifyArtistPhoto(id: string): Promise<string | null> {
  const token = await getSpotifyAppToken();
  const res = await spotifyFetch(`https://api.spotify.com/v1/artists/${id}`, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 404 || res.status === 400) return null;
  if (!res.ok) throw new Error(`Spotify request failed (/artists/${id}): ${res.status}`);
  return (await res.json()).images?.[0]?.url ?? null;
}

export async function searchSpotifyArtistPhotoExact(name: string): Promise<{ found: boolean; photo: string | null }> {
  const data = await spotifyGet('/search', { q: `artist:${name}`, type: 'artist', limit: '10' });
  const want = name.trim().toLowerCase();
  const hit = (data.artists?.items || []).find((a: { name: string }) => a.name.toLowerCase() === want) as { images?: { url: string }[] } | undefined;
  return { found: !!hit, photo: hit?.images?.[0]?.url ?? null };
}

// One page (10, development mode's cap) of a genre's top artists or of its
// lesser-known albums, for the endless shelves on Discover.
export async function genreArtistsPage(genreBucket: string, offset: number, market?: string | null): Promise<CatalogArtist[]> {
  const keyword = GENRE_SEARCH_KEYWORD[genreBucket] ?? genreBucket.toLowerCase();
  const params: Record<string, string> = { q: `genre:${keyword}`, type: 'artist', limit: '10', offset: String(offset) };
  if (isValidMarket(market)) params.market = market;
  const data = await spotifyGet('/search', params);
  return (data.artists?.items || []).map((a: { id: string; name: string; images: { url: string }[] }) => ({ id: a.id, name: a.name, photo: a.images?.[0]?.url ?? null }));
}

