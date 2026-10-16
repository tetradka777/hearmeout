import { NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/identity';
import { RateLimitError, upstreamErrorResponse } from '@/lib/upstreamError';
import { fetchSpotifyArtistDetail, fetchArtistAlbumsSplit, type ArtistDetail, type SpotifyArtistAlbumRef } from '@/lib/spotifyCatalog';
import { deezerArtistByName, deezerArtistGenres } from '@/lib/deezerServer';
import { peekSpotifyCache, withSpotifyCache } from '@/lib/spotifyCache';

type CachedArtist = { artist: ArtistDetail | null; released: SpotifyArtistAlbumRef[]; upcoming: SpotifyArtistAlbumRef[] };

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  // Signed-in only: this calls Spotify/Deezer/Ticketmaster on the server, and
  // an open endpoint let anyone spend the app's shared API quota.
  if (!(await getCurrentUserId())) return NextResponse.json({ error: 'not_registered' }, { status: 401 });
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
    // Spotify is rate-limiting the app and this artist isn't cached yet: the
    // header from Deezer by name (Spotify's own name if any lookup stored
    // it, else the one the page already shows), without the album list.
    // Not cached, so the full page comes back once Spotify answers again.
    if (err instanceof RateLimitError) {
      const name = (await peekSpotifyCache<string>(`artist-name:v1:${id}`)) || new URL(request.url).searchParams.get('name')?.slice(0, 200);
      if (name) {
        // Only a Deezer artist with exactly this name: never someone else's face.
        const found = await deezerArtistByName(name).catch(() => null);
        const dz = found?.exact ? found : null;
        const genres = dz ? await deezerArtistGenres(name).catch(() => [] as string[]) : [];
        return NextResponse.json({ id, name, photo: dz?.photo ?? null, genres, fans: dz?.fans ?? null, releasedAlbums: [], upcomingAlbums: [], limited: true });
      }
    }
    return upstreamErrorResponse(err, '/api/spotify/artist/[id]');
  }
}
