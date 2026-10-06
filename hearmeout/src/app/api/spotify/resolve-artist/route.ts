import { NextRequest, NextResponse } from 'next/server';
import { upstreamErrorResponse } from '@/lib/upstreamError';
import { resolveSpotifyArtistId } from '@/lib/spotifyCatalog';
import { withSpotifyCache } from '@/lib/spotifyCache';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const name = searchParams.get('name');
  if (!name) return NextResponse.json({ error: 'missing_params' }, { status: 400 });

  try {
    const id = await withSpotifyCache(`resolve-artist:${name}`, 86400, () => resolveSpotifyArtistId(name));
    if (!id) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return NextResponse.json({ id }, { headers: { 'Cache-Control': 's-maxage=3600, stale-while-revalidate=86400' } });
  } catch (err) {
    return upstreamErrorResponse(err, '/api/spotify/resolve-artist');
  }
}
