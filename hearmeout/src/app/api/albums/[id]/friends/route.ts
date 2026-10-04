import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUserId } from '@/lib/identity';
import { DEFAULT_PRIVACY, fetchPrivacy } from '@/lib/privacy';

// Your friends' scores for one album ("Friends who rated", "your circle"
// average on the album page). Replaces a direct browser read of `ratings`.
// Skips private ratings and friends who turned off "Ratings visible to
// friends".
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'not_registered' }, { status: 401 });
  const { id } = await context.params;
  const admin = supabaseAdmin();
  const { data: fr } = await admin.from('friendships').select('friend_id').eq('user_id', userId);
  const friendIds = (fr || []).map((r) => r.friend_id as string);
  if (!friendIds.length) return NextResponse.json({ ratings: [] });
  const [{ data, error }, privacy] = await Promise.all([
    admin.from('ratings').select('user_id, stars, is_private').eq('album_id', id).in('user_id', friendIds),
    fetchPrivacy(admin, friendIds),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const ratings = (data || [])
    .filter((r) => !r.is_private && (privacy.get(r.user_id as string) ?? DEFAULT_PRIVACY).ratingsVisible)
    .map((r) => ({ userId: r.user_id as string, stars: Number(r.stars) }));
  return NextResponse.json({ ratings });
}
