import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUserId } from '@/lib/identity';
import { DEFAULT_PRIVACY, fetchPrivacy } from '@/lib/privacy';

// Written reviews of an album (album page). Replaces a direct browser read
// of `ratings` with the public anon key. Never returns private ratings; a
// reviewer who turned off "Public reviews" is only shown to their friends
// (and themselves).
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const viewerId = await getCurrentUserId();
  const { id } = await context.params;
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from('ratings')
    .select('user_id, stars, review, created_at, is_private, users(name, handle, avatar_url)')
    .eq('album_id', id)
    .not('review', 'is', null)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const rows = (data || []).filter((r) => !r.is_private && typeof r.review === 'string' && r.review.trim());

  const privacy = await fetchPrivacy(admin, rows.map((r) => r.user_id as string));
  const restricted = rows.filter((r) => !(privacy.get(r.user_id as string) ?? DEFAULT_PRIVACY).publicReviews).map((r) => r.user_id as string);
  let friendIds = new Set<string>();
  if (viewerId && restricted.length) {
    const { data: f } = await admin.from('friendships').select('friend_id').eq('user_id', viewerId).in('friend_id', restricted);
    friendIds = new Set((f || []).map((x) => x.friend_id as string));
  }

  const reviews = rows
    .filter((r) => {
      const uid = r.user_id as string;
      return (privacy.get(uid) ?? DEFAULT_PRIVACY).publicReviews || uid === viewerId || friendIds.has(uid);
    })
    .map((r) => {
      const u = r.users as unknown as { name: string; handle: string; avatar_url: string | null } | null;
      return { stars: Number(r.stars), review: r.review as string, createdAt: r.created_at as string, user: { name: u?.name ?? '', handle: u?.handle ?? '', avatarUrl: u?.avatar_url ?? null } };
    });
  return NextResponse.json({ reviews });
}
