import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/identity';
import { upstreamErrorResponse } from '@/lib/upstreamError';
import { resolveSpotifyAlbumId } from '@/lib/spotifyCatalog';
import { peekSpotifyCache, storeSpotifyCache, withSpotifyCache } from '@/lib/spotifyCache';

class AlbumNotFound extends Error {}

export async function GET(request: NextRequest) {
  // Signed-in only: this calls Spotify/Deezer/Ticketmaster on the server, and
  // an open endpoint let anyone spend the app's shared API quota.
  if (!(await getCurrentUserId())) return NextResponse.json({ error: 'not_registered' }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const title = searchParams.get('title');
  const artist = searchParams.get('artist');
  const artistId = searchParams.get('artistId') || null;
  if (artistId && !/^[A-Za-z0-9]{22}$/.test(artistId)) return NextResponse.json({ error: 'invalid_artist_id' }, { status: 400 });
  if (!title || !artist) return NextResponse.json({ error: 'missing_params' }, { status: 400 });

  try {
    const key = `resolve-album:v4:${title.toLowerCase()}:${artistId || artist.toLowerCase()}`;
    // Keep successful mappings. A miss must not poison the shared cache for six months.
    const known = await peekSpotifyCache<string>(key);
    const id = known || await withSpotifyCache(key + ':retry', 180 * 86400, async () => {
      const found = await resolveSpotifyAlbumId(title, artist, artistId);
      if (!found) throw new AlbumNotFound();
      return found;
    });
    if (!known && id) await storeSpotifyCache(key, id, 180 * 86400);
    if (!id) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return NextResponse.json({ id }, { headers: { 'Cache-Control': 's-maxage=3600, stale-while-revalidate=86400' } });
  } catch (err) {
    if (err instanceof AlbumNotFound) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return upstreamErrorResponse(err, '/api/spotify/resolve-album');
  }
}
