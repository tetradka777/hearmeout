import { NextResponse } from 'next/server';
import { upstreamErrorResponse } from '@/lib/upstreamError';
import { fetchSpotifyArtistDetail, fetchArtistAlbumsSplit, type ArtistDetail, type SpotifyArtistAlbumRef } from '@/lib/spotifyCatalog';
import { withSpotifyCache } from '@/lib/spotifyCache';

type CachedArtist = { artist: ArtistDetail | null; released: SpotifyArtistAlbumRef[]; upcoming: SpotifyArtistAlbumRef[] };

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const result = await withSpotifyCache<CachedArtist>(`artist:v2:${id}`, 21600, async () => {
      const [artist, albums] = await Promise.all([fetchSpotifyArtistDetail(id), fetchArtistAlbumsSplit(id)]);
      return { artist, released: albums.released, upcoming: albums.upcoming };
    });
    if (!result.artist) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return NextResponse.json(
      { ...result.artist, releasedAlbums: result.released, upcomingAlbums: result.upcoming },
      { headers: { 'Cache-Control': 's-maxage=3600, stale-while-revalidate=86400' } }
    );
  } catch (err) {
    return upstreamErrorResponse(err, '/api/spotify/artist/[id]');
  }
}
