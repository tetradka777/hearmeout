import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/identity';
import { upstreamErrorResponse } from '@/lib/upstreamError';
import { fetchObscureAlbums } from '@/lib/spotifyCatalog';
import { withSpotifyCache } from '@/lib/spotifyCache';

export async function GET(request: NextRequest) {
  // Signed-in only: this calls Spotify/Deezer/Ticketmaster on the server, and
  // an open endpoint let anyone spend the app's shared API quota.
  if (!(await getCurrentUserId())) return NextResponse.json({ error: 'not_registered' }, { status: 401 });
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
