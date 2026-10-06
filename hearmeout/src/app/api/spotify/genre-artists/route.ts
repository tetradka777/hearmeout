import { NextRequest, NextResponse } from 'next/server';
import { upstreamErrorResponse } from '@/lib/upstreamError';
import { fetchGenreTopArtists } from '@/lib/spotifyCatalog';
import { withSpotifyCache } from '@/lib/spotifyCache';

export async function GET(request: NextRequest) {
  const params = new URL(request.url).searchParams;
  const genre = params.get('genre');
  const market = params.get('market');
  if (!genre) return NextResponse.json({ error: 'genre_required' }, { status: 400 });
  try {
    const artists = await withSpotifyCache(
      `genre-artists:${genre}:${market || 'global'}`,
      3600,
      () => fetchGenreTopArtists(genre, 8, market)
    );
    // No Cache-Control: Netlify's edge cache ignores the genre/market query
    // string for this route — withSpotifyCache above already caches
    // correctly per genre+market.
    return NextResponse.json(artists);
  } catch (err) {
    return upstreamErrorResponse(err, '/api/spotify/genre-artists');
  }
}
