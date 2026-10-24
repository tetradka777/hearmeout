import { NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/identity';
import { risingArtists } from '@/lib/risingArtists';
import { upstreamErrorResponse } from '@/lib/upstreamError';

// Discover → "lesser-known artists": our picks, then artists whose fans keep
// growing (lib/risingArtists). No Spotify requests.
export async function GET() {
  if (!(await getCurrentUserId())) return NextResponse.json({ error: 'not_registered' }, { status: 401 });
  try {
    return NextResponse.json(await risingArtists());
  } catch (err) {
    return upstreamErrorResponse(err, '/api/rising');
  }
}
