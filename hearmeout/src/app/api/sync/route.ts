import { NextResponse } from 'next/server';
import { upstreamErrorResponse } from '@/lib/upstreamError';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUserId } from '@/lib/identity';
import { syncSpotifyForUser } from '@/lib/spotifySync';

export async function POST() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'not_registered' }, { status: 401 });

  try {
    const admin = supabaseAdmin();
    const result = await syncSpotifyForUser(admin, userId);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof Error && err.message === 'not_connected') return NextResponse.json({ error: 'not_connected' }, { status: 400 });
    return upstreamErrorResponse(err, '/api/sync');
  }
}
