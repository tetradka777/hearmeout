import { NextRequest, NextResponse } from 'next/server';
import { concertsConfigured, cachedArtistConcerts, regionFirst } from '@/lib/concerts';

// Concerts tab on the artist page: every upcoming show worldwide, the
// viewer's country first. `configured: false` (no TICKETMASTER_API_KEY)
// tells the client to show its ticket-search fallback instead of "no dates".
export async function GET(request: NextRequest) {
  if (!concertsConfigured()) return NextResponse.json({ configured: false, concerts: [] });
  const url = new URL(request.url);
  const name = (url.searchParams.get('name') || '').trim().slice(0, 200);
  const country = (url.searchParams.get('country') || '').toUpperCase();
  if (!name) return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
  try {
    const concerts = regionFirst(await cachedArtistConcerts(name), country || null);
    return NextResponse.json({ configured: true, concerts });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
