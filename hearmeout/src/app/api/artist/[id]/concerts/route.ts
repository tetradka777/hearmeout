import { NextRequest, NextResponse } from 'next/server';
import { concertsConfigured, fetchArtistConcerts } from '@/lib/concerts';
import { withSpotifyCache } from '@/lib/spotifyCache';

// Concerts tab on the artist page. `configured: false` (no
// TICKETMASTER_API_KEY) tells the client to show its ticket-search
// fallback instead of "no dates". Cached 6h in the shared API cache table.
export async function GET(request: NextRequest) {
  if (!concertsConfigured()) return NextResponse.json({ configured: false, concerts: [] });
  const url = new URL(request.url);
  const name = (url.searchParams.get('name') || '').trim().slice(0, 200);
  const country = (url.searchParams.get('country') || '').toUpperCase();
  if (!name) return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
  try {
    const concerts = await withSpotifyCache(`concerts:${name.toLowerCase()}:${country || 'any'}`, 6 * 3600, () => fetchArtistConcerts(name, country || null));
    return NextResponse.json({ configured: true, concerts });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
