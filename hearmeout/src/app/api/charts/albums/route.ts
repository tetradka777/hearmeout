import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/identity';
import { upstreamErrorResponse } from '@/lib/upstreamError';
import { chartAlbums } from '@/lib/appleCharts';

// "Popular now" on Discover (lib/appleCharts): this week's most played
// albums in the viewer's region. Signed-in only, like the other routes that
// spend the shared Spotify quota.
export async function GET(request: NextRequest) {
  if (!(await getCurrentUserId())) return NextResponse.json({ error: 'not_registered' }, { status: 401 });
  const region = new URL(request.url).searchParams.get('region');
  try {
    return NextResponse.json(await chartAlbums(region));
  } catch (err) {
    return upstreamErrorResponse(err, '/api/charts/albums');
  }
}
