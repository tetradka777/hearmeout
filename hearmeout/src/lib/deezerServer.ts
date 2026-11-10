import { peekSpotifyCache, withSpotifyCache } from './spotifyCache';
import { RateLimitError } from './upstreamError';
import { normalizeArtistName } from './artistIdentity';

// Server-side Deezer API (no key). Spotify's development mode no longer gives
// this app artist top tracks, genres or follower counts, so those come from
// Deezer. Deezer allows 50 requests per 5 seconds per IP, and every visitor's
// request leaves from this one server, so calls are spaced to stay under 45
// per 5 s; anything that can be is cached in spotify_cache.

const WINDOW_MS = 5000;
const MAX_IN_WINDOW = 45;
const sent: number[] = [];

async function slot(): Promise<void> {
  for (;;) {
    const now = Date.now();
    while (sent.length && now - sent[0] >= WINDOW_MS) sent.shift();
    if (sent.length < MAX_IN_WINDOW) { sent.push(now); return; }
    await new Promise((r) => setTimeout(r, WINDOW_MS - (now - sent[0]) + 10));
  }
}

// Deezer answers a quota error with HTTP 200 and { error: { code: 4 } }.
export async function deezerGet<T>(path: string): Promise<T> {
  await slot();
  const res = await fetch(`https://api.deezer.com${path}`);
  if (res.status === 429) throw new RateLimitError(5);
  if (!res.ok) throw new Error(`Deezer request failed (${path}): ${res.status}`);
  const data = await res.json();
  if (data?.error) {
    if (data.error.code === 4) throw new RateLimitError(5);
    throw new Error(`Deezer error (${path}): ${data.error.message || data.error.code}`);
  }
  return data as T;
}

export function normalizeTitle(s: string): string {
  return s
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s*[([].*?(remaster|deluxe|edition|version|live|mono|stereo|bonus|expanded|anniversary).*?[)\]]/g, '')
    .replace(/\s+-\s+.*(remaster|version|live|edit|mix).*$/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

type DzArtist = { id: number; name: string; nb_fan?: number; picture_medium?: string; picture_big?: string };
// exact: the name matched exactly (else the best known artist for the search).
// namesakes: how many Deezer artists have exactly this name.
export type DeezerArtist = { id: number; name: string; fans: number | null; photo: string | null; exact?: boolean; namesakes?: number; unambiguous?: boolean; matchedAlbums?: number };

// The artist with exactly this name if there is one, else the best known
// (Deezer orders artist search by relevance and popularity). 30 days.
export function deezerArtistByName(name: string): Promise<DeezerArtist | null> {
  return withSpotifyCache(`dz-artist:v5:${normalizeArtistName(name)}`, 30 * 86400, async () => {
    const data = await deezerGet<{ data?: DzArtist[]; next?: string }>(`/search/artist?q=${encodeURIComponent(name)}&limit=25`);
    const list = data.data || [];
    const want = normalizeArtistName(name);
    // Several artists can share a name: the best known of them.
    const same = list.filter((x) => normalizeArtistName(x.name) === want).sort((x, y) => (y.nb_fan ?? 0) - (x.nb_fan ?? 0));
    const a = same[0] || list[0];
    return a ? { id: a.id, name: a.name, fans: a.nb_fan ?? null, photo: a.picture_medium ?? null, exact: !!same[0], namesakes: same.length, unambiguous: same.length === 1 && !data.next } : null;
  });
}

// The Deezer artist that is this Spotify artist. Names aren't enough —
// Deezer has three different "Miley"s, and a name search also returns Miley
// Cyrus — so only artists with exactly this name count, and among them the
// one whose albums share titles with the Spotify artist's albums. Without
// any shared title it's nobody (null): no Deezer data beats someone else's.
// With no Spotify album titles to compare, reuse only a previously
// confirmed mapping for this id. 30 days per Spotify artist.
export function deezerArtistFor(spotifyId: string, name: string, spotifyAlbumTitles: string[]): Promise<DeezerArtist | null> {
  const titles = new Set(spotifyAlbumTitles.map(normalizeTitle).filter(Boolean));
  if (!titles.size) return cachedDeezerArtistForSpotify(spotifyId).then((a) => a && normalizeArtistName(a.name) === normalizeArtistName(name) ? a : null);
  const find = async (): Promise<DeezerArtist | null> => {
    const data = await deezerGet<{ data?: DzArtist[]; next?: string }>(`/search/artist?q=${encodeURIComponent(name)}&limit=25`);
    const want = normalizeArtistName(name);
    const same = (data.data || []).filter((x) => normalizeArtistName(x.name) === want).sort((x, y) => (y.nb_fan ?? 0) - (x.nb_fan ?? 0));
    const pick = (a: DzArtist): DeezerArtist => ({ id: a.id, name: a.name, fans: a.nb_fan ?? null, photo: a.picture_medium ?? null, exact: true, namesakes: same.length });
    // Search pagination means another exact namesake may be outside this
    // bounded lookup. Skip instead of asserting that this page proves identity.
    if (data.next) return null;
    let best: { a: DzArtist; shared: number } | null = null;
    let tied = false;
    // If there are too many candidates to verify, do not guess from the
    // first five and silently ignore another namesake with equal evidence.
    if (same.length > 5) return null;
    for (const a of same) {
      const albums = await deezerGet<{ data?: { title: string }[] }>(`/artist/${a.id}/albums?limit=100`);
      const shared = new Set((albums.data || []).map((al) => normalizeTitle(al.title)).filter((tl) => titles.has(tl))).size;
      if (shared && (!best || shared > best.shared)) { best = { a, shared }; tied = false; }
      else if (shared && shared === best?.shared) tied = true;
    }
    return best && !tied ? { ...pick(best.a), matchedAlbums: best.shared } : null;
  };
  // Only a comparison with real titles is worth keeping for a month.
  return withSpotifyCache(`dz-artist-for:v2:${spotifyId}`, 30 * 86400, find);
}

// The genres of a Deezer artist's latest albums, most common first. 30 days.
export function deezerGenresById(artistId: number): Promise<string[]> {
  return withSpotifyCache(`dz-genres-id:v1:${artistId}`, 30 * 86400, async () => {
    const albums = await deezerGet<{ data?: { id: number }[] }>(`/artist/${artistId}/albums?limit=3`);
    const count = new Map<string, number>();
    for (const al of (albums.data || []).slice(0, 2)) {
      const full = await deezerGet<{ genres?: { data?: { name: string }[] } }>(`/album/${al.id}`);
      for (const g of full.genres?.data || []) count.set(g.name, (count.get(g.name) || 0) + 1);
    }
    return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([g]) => g);
  });
}

// A Deezer artist's most played tracks. A day.
export function deezerTopTracksById(artistId: number, limit = 10): Promise<DeezerTopTrack[]> {
  return withSpotifyCache(`dz-top-id:v1:${artistId}`, 86400, async () => {
    const top = await deezerGet<{ data?: { title: string; duration: number; album?: { title?: string; cover_xl?: string } }[] }>(`/artist/${artistId}/top?limit=${limit}`);
    return (top.data || []).map((t) => ({
      title: t.title,
      durationMs: (t.duration || 0) * 1000,
      albumTitle: t.album?.title || '',
      albumCover: t.album?.cover_xl ?? null,
    }));
  });
}

// An artist's genres: Deezer keeps them on albums, so the genres of their
// most recent albums, most common first. 30 days.
export function deezerArtistGenres(name: string): Promise<string[]> {
  return withSpotifyCache(`dz-genres:v2:${name.toLowerCase()}`, 30 * 86400, async () => {
    const artist = await deezerArtistByName(name);
    if (!artist?.exact || !artist.unambiguous) return [];
    const albums = await deezerGet<{ data?: { id: number }[] }>(`/artist/${artist.id}/albums?limit=3`);
    const count = new Map<string, number>();
    for (const al of (albums.data || []).slice(0, 2)) {
      const full = await deezerGet<{ genres?: { data?: { name: string }[] } }>(`/album/${al.id}`);
      for (const g of full.genres?.data || []) count.set(g.name, (count.get(g.name) || 0) + 1);
    }
    return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([g]) => g);
  });
}

export type DeezerTopTrack = { title: string; durationMs: number; albumTitle: string; albumCover: string | null };

// The artist's most played tracks on Deezer, without preview URLs (those
// are signed for 15 minutes; /api/deezer/preview fetches them fresh). A day.
export function deezerTopTracks(name: string, limit = 10): Promise<DeezerTopTrack[]> {
  return withSpotifyCache(`dz-top:v1:${name.toLowerCase()}`, 86400, async () => {
    const artist = await deezerArtistByName(name);
    if (!artist) return [];
    const top = await deezerGet<{ data?: { title: string; duration: number; album?: { title?: string; cover_xl?: string } }[] }>(`/artist/${artist.id}/top?limit=${limit}`);
    return (top.data || []).map((t) => ({
      title: t.title,
      durationMs: (t.duration || 0) * 1000,
      albumTitle: t.album?.title || '',
      albumCover: t.album?.cover_xl ?? null,
    }));
  });
}

// An artist's releases on Deezer, newest first (12 hours). The news strip
// and release notifications use this instead of Spotify's artist album
// list: they look at dozens of artists every few hours, which is exactly
// the kind of background load that got the app's Spotify quota blocked.
export type DeezerRelease = { id: number; title: string; date: string; cover: string | null };
export function deezerReleasesById(artistId: number): Promise<DeezerRelease[]> {
  return withSpotifyCache(`dz-releases:v1:${artistId}`, 12 * 3600, async () => {
    const data = await deezerGet<{ data?: { id: number; title: string; release_date?: string; cover_xl?: string; cover_medium?: string }[] }>(`/artist/${artistId}/albums?limit=50`);
    return (data.data || [])
      .filter((a) => a.release_date && /^\d{4}-\d{2}-\d{2}$/.test(a.release_date))
      .map((a) => ({ id: a.id, title: a.title, date: a.release_date!, cover: a.cover_xl ?? a.cover_medium ?? null }))
      .sort((a, b) => b.date.localeCompare(a.date));
  });
}

// The Deezer artist for a bare name (news strip, release checks): exactly
// this name, and if Deezer has namesakes, only the one already confirmed
// for this artist's Spotify id (deezerArtistFor's cache) — never a guess.
export async function cachedDeezerArtistForSpotify(spotifyId: string): Promise<DeezerArtist | null> {
  // v1 could choose a tied namesake by popularity; only the new, explicit
  // album-match evidence may cross the Spotify/Deezer identity boundary.
  const hit = await peekSpotifyCache<DeezerArtist | null>(`dz-artist-for:v2:${spotifyId}`);
  return hit?.exact && (hit.matchedAlbums || 0) > 0 ? hit : null;
}

export async function deezerArtistIdForName(name: string, spotifyId?: string | null, albumTitles: string[] = []): Promise<number | null> {
  if (spotifyId) {
    const confirmed = await cachedDeezerArtistForSpotify(spotifyId);
    if (confirmed && normalizeArtistName(confirmed.name) === normalizeArtistName(name)) return confirmed.id;
    const albums = await peekSpotifyCache<{ released: { title: string }[]; upcoming?: { title: string }[] }>(`artistalbums:v1:${spotifyId}`);
    const titles = [...(albums?.released || []), ...(albums?.upcoming || [])].map((a) => a.title);
    if (titles.length || albumTitles.length) return (await deezerArtistFor(spotifyId, name, [...titles, ...albumTitles]))?.id ?? null;
  }
  // Listening imports and curated albums can supply album evidence even
  // before Spotify's artist id is known. This costs Deezer, never Spotify.
  if (albumTitles.length) return (await deezerArtistFor(`name:${normalizeArtistName(name)}`, name, albumTitles))?.id ?? null;
  const dz = await deezerArtistByName(name);
  return dz?.exact && dz.unambiguous ? dz.id : null;
}
