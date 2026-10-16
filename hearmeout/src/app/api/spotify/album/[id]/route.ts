import { NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/identity';
import { upstreamErrorResponse } from '@/lib/upstreamError';
import { fetchSpotifyAlbumDetail } from '@/lib/spotifyCatalog';
import { withSpotifyCache } from '@/lib/spotifyCache';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  // Signed-in only: this calls Spotify/Deezer/Ticketmaster on the server, and
  // an open endpoint let anyone spend the app's shared API quota.
  if (!(await getCurrentUserId())) return NextResponse.json({ error: 'not_registered' }, { status: 401 });
  const { id } = await context.params;
  // Not a Spotify album id (e.g. a catalog slug): Spotify would answer 400.
  if (!/^[0-9A-Za-z]{22}$/.test(id)) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  try {
    const album = await withSpotifyCache(`album:${id}`, 180 * 86400, () => fetchSpotifyAlbumDetail(id));
    if (!album) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return NextResponse.json(album, { headers: { 'Cache-Control': 's-maxage=3600, stale-while-revalidate=86400' } });
  } catch (err) {
    return upstreamErrorResponse(err, '/api/spotify/album/[id]');
  }
}
