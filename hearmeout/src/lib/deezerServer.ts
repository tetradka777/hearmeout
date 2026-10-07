import { withSpotifyCache } from './spotifyCache';
import { RateLimitError } from './upstreamError';

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
export type DeezerArtist = { id: number; name: string; fans: number | null; photo: string | null };

// The artist with exactly this name if there is one, else the best known
// (Deezer orders artist search by relevance and popularity). 30 days.
export function deezerArtistByName(name: string): Promise<DeezerArtist | null> {
  return withSpotifyCache(`dz-artist:v1:${name.toLowerCase()}`, 30 * 86400, async () => {
    const data = await deezerGet<{ data?: DzArtist[] }>(`/search/artist?q=${encodeURIComponent(name)}&limit=5`);
    const list = data.data || [];
    const want = normalizeTitle(name);
    const a = list.find((x) => normalizeTitle(x.name) === want) || list[0];
    return a ? { id: a.id, name: a.name, fans: a.nb_fan ?? null, photo: a.picture_medium ?? null } : null;
  });
}

// An artist's genres: Deezer keeps them on albums, so the genres of their
// most recent albums, most common first. 30 days.
export function deezerArtistGenres(name: string): Promise<string[]> {
  return withSpotifyCache(`dz-genres:v1:${name.toLowerCase()}`, 30 * 86400, async () => {
    const artist = await deezerArtistByName(name);
    if (!artist) return [];
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
