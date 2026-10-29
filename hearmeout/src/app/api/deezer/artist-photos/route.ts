import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/identity';
import { deezerArtistByName } from '@/lib/deezerServer';
import { fetchSpotifyArtistPhoto, searchSpotifyArtistPhotoExact } from '@/lib/spotifyCatalog';
import { withSpotifyCache } from '@/lib/spotifyCache';

const MAX_NAMES = 40;
const DAY = 86400;
const SPOTIFY_ID = /^[A-Za-z0-9]{22}$/;

type Item = { name: string; id?: string | null };

// One artist's photo. With a Spotify id it's that artist's own photo or
// none: looking the name up instead found same-named strangers (an artist
// without a Spotify photo got another one's face from Deezer). Spotify not
// answering (over its rate limit) leaves the photo unknown (undefined), so
// the browser asks again later rather than keeping a letter. By name only:
// a Deezer artist with exactly this name and no namesakes, else the one
// Spotify artist with exactly this name (Deezer first: a name search costs
// Spotify quota, which the whole app shares). A merely similar name or
// several namesakes give no photo (a letter) rather than someone else's face.
async function photoFor({ name, id }: Item): Promise<string | null | undefined> {
  if (id && SPOTIFY_ID.test(id)) {
    try {
      return await withSpotifyCache(`sp-aphoto:v1:${id}`, 90 * DAY, () => fetchSpotifyArtistPhoto(id));
    } catch {
      return undefined;
    }
  }
  try {
    const dz = await deezerArtistByName(name);
    // Not when Deezer has several artists with this name (which one?).
    if (dz?.exact && (dz.namesakes ?? 1) <= 1 && dz.photo) return dz.photo;
  } catch { /* fall through */ }
  try {
    const hit = await withSpotifyCache(`sp-aexact:v2:${name.toLowerCase()}`, 90 * DAY, () => searchSpotifyArtistPhotoExact(name));
    return hit.photo;
  } catch {
    return null;
  }
}

// Artist photos for the small avatars next to artist names (ArtistName):
// many in one request instead of one each. Each answer is keyed by the
// Spotify id when one was sent, else by the name.
export async function POST(request: NextRequest) {
  if (!(await getCurrentUserId())) return NextResponse.json({ error: 'not_registered' }, { status: 401 });
  const body = await request.json().catch(() => null) as { items?: unknown; names?: unknown } | null;
  const raw: unknown[] = Array.isArray(body?.items) ? body.items : Array.isArray(body?.names) ? body.names.map((n) => ({ name: n })) : [];
  const seen = new Set<string>();
  const items: Item[] = [];
  for (const it of raw) {
    const name = typeof it === 'object' && it && typeof (it as Item).name === 'string' ? (it as Item).name.trim() : '';
    const id = typeof it === 'object' && it && typeof (it as Item).id === 'string' ? (it as Item).id : null;
    const key = id || name;
    if (!name || name.length > 200 || seen.has(key)) continue;
    seen.add(key);
    items.push({ name, id });
    if (items.length >= MAX_NAMES) break;
  }
  if (!items.length) return NextResponse.json({ error: 'missing_names' }, { status: 400 });

  const photos: Record<string, string | null | undefined> = {};
  // Four at a time: a page of new names shouldn't burst Spotify's rate limit
  // (over it, every Spotify call in the app fails fast until it resets).
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, items.length) }, async () => {
    while (next < items.length) { const it = items[next++]; photos[it.id || it.name] = await photoFor(it); }
  }));
  return NextResponse.json({ photos });
}
