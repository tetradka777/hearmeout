import { NextResponse } from 'next/server';
import { albumSummary } from '@/lib/albumSummary';

// Community average and count per album (the album_ratings view), read on
// the server. The view is security_invoker, so once direct reads of
// `ratings` are closed to the anon key (migration 022) the browser can no
// longer read it itself. Shared and briefly kept: lib/albumSummary.
export async function GET() {
  try {
    return NextResponse.json(await albumSummary(), { headers: { 'Cache-Control': 'private, max-age=30' } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'failed' }, { status: 500 });
  }
}
