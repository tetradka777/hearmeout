import { NextResponse } from 'next/server';
import { upstreamErrorResponse } from '@/lib/upstreamError';
import { fetchSpotifyAlbumDetail } from '@/lib/spotifyCatalog';
import { withSpotifyCache } from '@/lib/spotifyCache';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const album = await withSpotifyCache(`album:${id}`, 14 * 86400, () => fetchSpotifyAlbumDetail(id));
    if (!album) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return NextResponse.json(album, { headers: { 'Cache-Control': 's-maxage=3600, stale-while-revalidate=86400' } });
  } catch (err) {
    return upstreamErrorResponse(err, '/api/spotify/album/[id]');
  }
}
