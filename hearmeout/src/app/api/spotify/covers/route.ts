import { NextResponse } from 'next/server';
import { ALBUMS } from '@/lib/data';
import { fetchSpotifyAlbumDetail, type AlbumDetail } from '@/lib/spotifyCatalog';
import { peekSpotifyCacheMany, withSpotifyCache } from '@/lib/spotifyCache';
import { inBackground } from '@/lib/spotifyPriority';

// Covers of the curated catalog albums. These used to be fetched from
// Spotify all at once (~220 parallel requests) every day — the likeliest
// cause of the app's multi-hour Spotify blocks. Now they're read from the
// album details already in the shared cache (one database query); albums
// not cached yet are fetched one by one in the background, at background
// priority, and kept for half a year like every album. The answer is
// remembered here for 10 minutes.
const MEMO_MS = 10 * 60 * 1000;
let memo: { at: number; covers: Record<string, string> } | null = null;
let filling = false;

async function build(): Promise<Record<string, string>> {
  const ids = ALBUMS.filter((a) => a.spotifyId).map((a) => ({ ourId: a.id, spotifyId: a.spotifyId! }));
  const cached = await peekSpotifyCacheMany<AlbumDetail | null>(ids.map((x) => `album:${x.spotifyId}`));
  // The map the old daily job left behind covers the rest meanwhile.
  const old = (await peekSpotifyCacheMany<Record<string, string>>(['covers:curated'])).get('covers:curated')?.payload || {};
  const covers: Record<string, string> = {};
  const missing: string[] = [];
  for (const { ourId, spotifyId } of ids) {
    const hit = cached.get(`album:${spotifyId}`);
    if (hit?.payload?.cover) covers[ourId] = hit.payload.cover;
    else if (old[ourId]) covers[ourId] = old[ourId];
    if (!hit && !old[ourId]) missing.push(spotifyId);
  }
  if (missing.length && !filling) {
    filling = true;
    void inBackground(async () => {
      for (const id of missing) {
        try {
          await withSpotifyCache(`album:${id}`, 180 * 86400, () => fetchSpotifyAlbumDetail(id));
        } catch {
          break; // rate limit or outage: the rest waits for a later request
        }
      }
    }).finally(() => { filling = false; memo = null; });
  }
  return covers;
}

export async function GET() {
  if (!memo || Date.now() - memo.at > MEMO_MS) memo = { at: Date.now(), covers: await build() };
  return NextResponse.json(memo.covers, { headers: { 'Cache-Control': 's-maxage=600, stale-while-revalidate=86400' } });
}
