import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

// Community average and count per album (the album_ratings view), read on
// the server. The view is security_invoker, so once direct reads of
// `ratings` are closed to the anon key (migration 022) the browser can no
// longer read it itself.
export async function GET() {
  const { data, error } = await supabaseAdmin().from('album_ratings').select('album_id, avg_stars, ratings_count');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || [], { headers: { 'Cache-Control': 'private, max-age=30' } });
}
