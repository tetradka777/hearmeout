import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/identity';
import { deezerArtistByName } from '@/lib/deezerServer';

const MAX_NAMES = 40;

// Artist photos for the small avatars next to artist names (ArtistName):
// many names in one request instead of one each. Every lookup is the same
// 30-day cached deezerArtistByName the artist page uses; a name that fails
// just comes back without a photo.
export async function POST(request: NextRequest) {
  if (!(await getCurrentUserId())) return NextResponse.json({ error: 'not_registered' }, { status: 401 });
  const body = await request.json().catch(() => null) as { names?: unknown } | null;
  const names = Array.isArray(body?.names)
    ? [...new Set(body.names.filter((n): n is string => typeof n === 'string' && n.trim().length > 0 && n.length <= 200))].slice(0, MAX_NAMES)
    : [];
  if (!names.length) return NextResponse.json({ error: 'missing_names' }, { status: 400 });

  const photos: Record<string, string | null> = {};
  await Promise.all(names.map(async (name) => {
    try {
      photos[name] = (await deezerArtistByName(name))?.photo ?? null;
    } catch {
      photos[name] = null;
    }
  }));
  return NextResponse.json({ photos });
}
