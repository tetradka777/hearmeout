import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/identity';
import { upstreamErrorResponse } from '@/lib/upstreamError';
import { deezerArtistByName } from '@/lib/deezerServer';

// Same reasoning as /api/deezer/preview — do this server-side instead of
// through the public corsproxy.io the client used to hit directly. The
// lookup is shared with the artist page and cached for 30 days.
export async function GET(request: NextRequest) {
  // Signed-in only: this calls Spotify/Deezer/Ticketmaster on the server, and
  // an open endpoint let anyone spend the app's shared API quota.
  if (!(await getCurrentUserId())) return NextResponse.json({ error: 'not_registered' }, { status: 401 });
  const name = new URL(request.url).searchParams.get('name') || '';
  if (!name) return NextResponse.json({ error: 'missing_query' }, { status: 400 });

  try {
    const artist = await deezerArtistByName(name);
    if (!artist?.photo) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    // No Cache-Control: an edge cache keyed by path only would ignore the
    // `name` query string and give every artist the first cached photo.
    return NextResponse.json({ photo: artist.photo });
  } catch (err) {
    return upstreamErrorResponse(err, '/api/deezer/artist-photo');
  }
}
