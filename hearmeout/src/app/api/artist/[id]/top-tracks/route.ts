import { NextRequest, NextResponse } from 'next/server';
import { upstreamErrorResponse } from '@/lib/upstreamError';
import { fetchArtistTopTracks } from '@/lib/spotifyCatalog';
import { withSpotifyCache } from '@/lib/spotifyCache';

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const market = new URL(request.url).searchParams.get('market');
  try {
    const tracks = await withSpotifyCache(`artist-top:${id}:${market || 'US'}`, 86400, () => fetchArtistTopTracks(id, market));
    return NextResponse.json({ tracks });
  } catch (err) {
    return upstreamErrorResponse(err, '/api/artist/[id]/top-tracks');
  }
}
