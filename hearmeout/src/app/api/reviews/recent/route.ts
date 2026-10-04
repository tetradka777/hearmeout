import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { DEFAULT_PRIVACY, fetchPrivacy } from '@/lib/privacy';

// Latest site-wide written reviews (Discover). Replaces a direct browser
// read of `ratings`; private ratings and reviewers who turned off "Public
// reviews" are left out.
export async function GET() {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from('ratings')
    .select('user_id, stars, review, created_at, album_id, is_private, users(name, handle, avatar_url)')
    .not('review', 'is', null)
    .order('created_at', { ascending: false })
    .limit(40);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const rows = (data || []).filter((r) => !r.is_private && typeof r.review === 'string' && r.review.trim());
  const privacy = await fetchPrivacy(admin, rows.map((r) => r.user_id as string));
  const reviews = rows
    .filter((r) => (privacy.get(r.user_id as string) ?? DEFAULT_PRIVACY).publicReviews)
    .slice(0, 8)
    .map((r) => {
      const u = r.users as unknown as { name: string; handle: string; avatar_url: string | null } | null;
      return { stars: Number(r.stars), review: r.review as string, createdAt: r.created_at as string, albumId: r.album_id as string, user: { name: u?.name ?? '', handle: u?.handle ?? '', avatarUrl: u?.avatar_url ?? null } };
    });
  return NextResponse.json({ reviews });
}
