import { NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/identity';
import { RateLimitError, upstreamErrorResponse } from '@/lib/upstreamError';
import { fetchArtistTopTracks, deezerOnlyTopTracks } from '@/lib/artistTopTracks';
import { fetchSpotifyArtistName } from '@/lib/spotifyCatalog';
import { peekSpotifyCache, withSpotifyCache } from '@/lib/spotifyCache';

// The artist page's Popular tab: Deezer's ranking matched to Spotify albums
// (lib/artistTopTracks.ts). The artist's name is looked up here rather than
// taken from the request, so nobody can fill the shared cache for an artist
// with another artist's tracks. While Spotify is rate-limiting the app the
// tab shows Deezer's ranking alone (not cached): the request's name is used
// only for that, when Spotify's name isn't known yet.
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  // Signed-in only: this calls Spotify/Deezer/Ticketmaster on the server, and
  // an open endpoint let anyone spend the app's shared API quota.
  if (!(await getCurrentUserId())) return NextResponse.json({ error: 'not_registered' }, { status: 401 });
  const { id } = await context.params;
  const nameKey = `artist-name:v1:${id}`;
  // ?cached=1: a prefetch — only what's cached, 204 otherwise.
  if (new URL(request.url).searchParams.get('cached') === '1') {
    const hit = await peekSpotifyCache<unknown[]>(`artist-top:v5:${id}`);
    return hit ? NextResponse.json({ tracks: hit }) : new NextResponse(null, { status: 204 });
  }
  try {
    const name = await withSpotifyCache(nameKey, 30 * 86400, () => fetchSpotifyArtistName(id));
    if (!name) return NextResponse.json({ tracks: [] });
    const tracks = await withSpotifyCache(`artist-top:v5:${id}`, 3 * 86400, () => fetchArtistTopTracks(id, name));
    return NextResponse.json({ tracks });
  } catch (err) {
    if (err instanceof RateLimitError) {
      const name = (await peekSpotifyCache<string>(nameKey)) || new URL(request.url).searchParams.get('name')?.slice(0, 200);
      if (name) {
        const albums = (await peekSpotifyCache<{ released: { title: string }[] }>(`artistalbums:v1:${id}`))?.released || [];
        const tracks = await deezerOnlyTopTracks(id, name, albums.map((a) => a.title)).catch(() => null);
        if (tracks?.length) return NextResponse.json({ tracks, limited: true });
      }
    }
    return upstreamErrorResponse(err, '/api/artist/[id]/top-tracks');
  }
}
