import { NextRequest, NextResponse } from 'next/server';
import { upstreamErrorResponse } from '@/lib/upstreamError';
import { resolveSpotifyAlbumId } from '@/lib/spotifyCatalog';
import { withSpotifyCache } from '@/lib/spotifyCache';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const title = searchParams.get('title');
  const artist = searchParams.get('artist');
  if (!title || !artist) return NextResponse.json({ error: 'missing_params' }, { status: 400 });

  try {
    const id = await withSpotifyCache(`resolve-album:${title}:${artist}`, 86400, () => resolveSpotifyAlbumId(title, artist));
    if (!id) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return NextResponse.json({ id }, { headers: { 'Cache-Control': 's-maxage=3600, stale-while-revalidate=86400' } });
  } catch (err) {
    return upstreamErrorResponse(err, '/api/spotify/resolve-album');
  }
}
