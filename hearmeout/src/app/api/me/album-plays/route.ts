import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUserId } from '@/lib/identity';

// "your plays" on the album screen's third stat tile (spec 6.2): how many
// times you played tracks from this album. listening_events.album_id holds
// the Spotify album id, so the client passes both our id and the Spotify
// one for catalog albums.
export async function GET(request: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'not_registered' }, { status: 401 });
  const ids = (new URL(request.url).searchParams.get('ids') || '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 4);
  if (!ids.length) return NextResponse.json({ plays: 0 });
  const { count, error } = await supabaseAdmin()
    .from('listening_events')
    .select('user_id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .in('album_id', ids);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ plays: count ?? 0 });
}
