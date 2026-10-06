import { NextRequest, NextResponse } from 'next/server';
import { upstreamErrorResponse } from '@/lib/upstreamError';
import { fetchObscureAlbums } from '@/lib/spotifyCatalog';
import { withSpotifyCache } from '@/lib/spotifyCache';

export async function GET(request: NextRequest) {
  const params = new URL(request.url).searchParams;
  const genre = params.get('genre') || 'electronic';
  const market = params.get('market');
  try {
    const albums = await withSpotifyCache(
      `obscure:${genre}:${market || 'global'}`,
      3600,
      () => fetchObscureAlbums(genre, 10, market)
    );
    // No Cache-Control: Netlify's edge cache ignores the genre/market query
    // string for this route — withSpotifyCache above already caches
    // correctly per genre+market.
    return NextResponse.json(albums);
  } catch (err) {
    return upstreamErrorResponse(err, '/api/spotify/obscure');
  }
}
