import { NextResponse } from 'next/server';
import { ALBUMS } from '@/lib/data';
import { fetchSpotifyAlbumDetail } from '@/lib/spotifyCatalog';
import { peekSpotifyCacheMany, withSpotifyCache } from '@/lib/spotifyCache';
import { inBackground } from '@/lib/spotifyPriority';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

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
let building: Promise<Record<string, string>> | null = null;

// Only the cover of each cached album, not its whole tracklist: reading
// ~220 full album payloads made a cold start take 8–12 s.
async function cachedCovers(keys: string[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  for (let i = 0; i < keys.length; i += 200) {
    const { data } = await supabaseAdmin().from('spotify_cache').select('key, cover:payload->>cover').in('key', keys.slice(i, i + 200));
    for (const row of (data || []) as { key: string; cover: string | null }[]) out.set(row.key, row.cover);
  }
  return out;
}

async function build(): Promise<Record<string, string>> {
  const ids = ALBUMS.filter((a) => a.spotifyId).map((a) => ({ ourId: a.id, spotifyId: a.spotifyId! }));
  const cached = await cachedCovers(ids.map((x) => `album:${x.spotifyId}`));
  // The map the old daily job left behind covers the rest meanwhile.
  const old = (await peekSpotifyCacheMany<Record<string, string>>(['covers:curated'])).get('covers:curated')?.payload || {};
  const covers: Record<string, string> = {};
  const missing: string[] = [];
  for (const { ourId, spotifyId } of ids) {
    const key = `album:${spotifyId}`;
    const hit = cached.get(key);
    if (hit) covers[ourId] = hit;
    else if (old[ourId]) covers[ourId] = old[ourId];
    if (!cached.has(key) && !old[ourId]) missing.push(spotifyId);
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
  if (!memo || Date.now() - memo.at > MEMO_MS) {
    building ??= build().finally(() => { building = null; });
    memo = { at: Date.now(), covers: await building };
  }
  return NextResponse.json(memo.covers, { headers: { 'Cache-Control': 's-maxage=600, stale-while-revalidate=86400' } });
}
