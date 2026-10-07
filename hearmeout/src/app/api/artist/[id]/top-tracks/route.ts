import { NextResponse } from 'next/server';
import { upstreamErrorResponse } from '@/lib/upstreamError';
import { fetchArtistTopTracks } from '@/lib/artistTopTracks';
import { fetchSpotifyArtistName } from '@/lib/spotifyCatalog';
import { withSpotifyCache } from '@/lib/spotifyCache';

// The artist page's Popular tab: Deezer's ranking matched to Spotify albums
// (lib/artistTopTracks.ts). The artist's name is looked up here rather than
// taken from the request, so nobody can fill the shared cache for an artist
// with another artist's tracks.
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const name = await withSpotifyCache(`artist-name:v1:${id}`, 30 * 86400, () => fetchSpotifyArtistName(id));
    if (!name) return NextResponse.json({ tracks: [] });
    const tracks = await withSpotifyCache(`artist-top:v2:${id}`, 86400, () => fetchArtistTopTracks(id, name));
    return NextResponse.json({ tracks });
  } catch (err) {
    return upstreamErrorResponse(err, '/api/artist/[id]/top-tracks');
  }
}
