import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/identity';
import { artistPhotoFor, type ArtistPhotoItem as Item } from '@/lib/artistPhotoServer';

const MAX_NAMES = 40;

// With an id: Spotify's own photo, then a Deezer identity confirmed through
// matching albums. With a name: an exact, unambiguous artist. Transient
// failures are omitted, so the browser does not cache missing photos.
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
    while (next < items.length) { const it = items[next++]; photos[it.id || it.name] = await artistPhotoFor(it); }
  }));
  return NextResponse.json({ photos });
}
