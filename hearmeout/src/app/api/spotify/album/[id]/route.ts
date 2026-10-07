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
  try {
    const album = await withSpotifyCache(`album:${id}`, 14 * 86400, () => fetchSpotifyAlbumDetail(id));
    if (!album) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return NextResponse.json(album, { headers: { 'Cache-Control': 's-maxage=3600, stale-while-revalidate=86400' } });
  } catch (err) {
    return upstreamErrorResponse(err, '/api/spotify/album/[id]');
  }
}
