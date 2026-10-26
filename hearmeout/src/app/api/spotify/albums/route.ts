import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/identity';
import { fetchSpotifyAlbumDetail, type AlbumDetail } from '@/lib/spotifyCatalog';
import { peekSpotifyCacheMany, withSpotifyCache } from '@/lib/spotifyCache';

const MAX_IDS = 60;
const SPOTIFY_ID = /^[0-9A-Za-z]{22}$/;
const TTL = 180 * 86400;
// How long the answer waits for albums nobody asked for before: briefly when
// it already has others to show, longer when it has nothing yet.
const BUDGET_WITH_HITS_MS = 400;
const BUDGET_MS = 3000;

// Many albums in one request (a wall of covers used to fire one request
// per album): every cached album comes from one database query, and only
// the albums nobody has opened before are asked of Spotify, a few at a
// time. { albums: { [id]: detail | null } } — null for an album Spotify
// doesn't have; an album that couldn't be fetched right now (rate limit)
// is left out, so the client can ask again later.
export async function POST(request: NextRequest) {
  if (!(await getCurrentUserId())) return NextResponse.json({ error: 'not_registered' }, { status: 401 });
  const body = await request.json().catch(() => null) as { ids?: unknown } | null;
  const ids = [...new Set((Array.isArray(body?.ids) ? body.ids : []).filter((x): x is string => typeof x === 'string' && SPOTIFY_ID.test(x)))].slice(0, MAX_IDS);
  if (!ids.length) return NextResponse.json({ albums: {} });

  const albums: Record<string, AlbumDetail | null> = {};
  const cached = await peekSpotifyCacheMany<AlbumDetail | null>(ids.map((id) => `album:${id}`));
  const missing: string[] = [];
  for (const id of ids) {
    const hit = cached.get(`album:${id}`);
    if (hit) {
      albums[id] = hit.payload;
      // Past its time: refreshed in the background, answered now.
      if (!hit.fresh) withSpotifyCache(`album:${id}`, TTL, () => fetchSpotifyAlbumDetail(id)).catch(() => {});
    } else missing.push(id);
  }

  // The known albums don't wait for the unknown ones: after the budget
  // (above) the answer goes out with what's there, the rest keep loading
  // here and are listed as `pending` — the client asks for them again
  // shortly and gets them from the cache.
  let next = 0;
  const work = Promise.all(Array.from({ length: Math.min(6, missing.length) }, async () => {
    while (next < missing.length) {
      const id = missing[next++];
      try {
        albums[id] = await withSpotifyCache(`album:${id}`, TTL, () => fetchSpotifyAlbumDetail(id));
      } catch {
        // Rate limit or outage: left out, asked again later.
      }
    }
  }));
  let done = !missing.length;
  void work.then(() => { done = true; });
  if (!done) await Promise.race([work, new Promise((r) => setTimeout(r, missing.length < ids.length ? BUDGET_WITH_HITS_MS : BUDGET_MS))]);
  // Finished: anything still absent failed (left out, as before).
  const pending = done ? [] : missing.filter((id) => !(id in albums));
  return NextResponse.json({ albums: { ...albums }, pending });
}
