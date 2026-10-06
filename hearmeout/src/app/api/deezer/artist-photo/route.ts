import { NextRequest, NextResponse } from 'next/server';
import { upstreamErrorResponse } from '@/lib/upstreamError';

// Same reasoning as /api/deezer/preview — do this server-side instead of
// through the public corsproxy.io the client used to hit directly.
export async function GET(request: NextRequest) {
  const name = new URL(request.url).searchParams.get('name') || '';
  if (!name) return NextResponse.json({ error: 'missing_query' }, { status: 400 });

  try {
    const res = await fetch(`https://api.deezer.com/search/artist?q=${encodeURIComponent(name)}&limit=1`);
    if (!res.ok) throw new Error(`Deezer search failed: ${res.status}`);
    const data = await res.json();
    const artist = (data.data || [])[0];
    if (!artist?.picture_medium) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    // No Cache-Control: Netlify's edge cache keys this route by path only,
    // ignoring the `name` query string — every artist would otherwise get
    // whichever photo happened to be cached for the first request.
    return NextResponse.json({ photo: artist.picture_medium });
  } catch (err) {
    return upstreamErrorResponse(err, '/api/deezer/artist-photo');
  }
}
