import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { DEFAULT_PRIVACY, fetchPrivacy } from '@/lib/privacy';

const PAGE = 24;

// Latest site-wide written reviews (Discover), newest first, in pages:
// ?from= is where the next page starts in the raw list (returned as `next`,
// null at the end). Private ratings and reviewers who turned off "Public
// reviews" are left out, so a page can hold fewer than PAGE.
export async function GET(request: NextRequest) {
  const from = Math.max(0, Number(new URL(request.url).searchParams.get('from')) || 0);
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from('ratings')
    .select('user_id, stars, review, tags, created_at, album_id, is_private, users(name, handle, avatar_url)')
    .not('review', 'is', null)
    .order('created_at', { ascending: false })
    .range(from, from + PAGE - 1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const raw = data || [];
  const rows = raw.filter((r) => !r.is_private && typeof r.review === 'string' && r.review.trim());
  const privacy = await fetchPrivacy(admin, rows.map((r) => r.user_id as string));
  const reviews = rows
    .filter((r) => (privacy.get(r.user_id as string) ?? DEFAULT_PRIVACY).publicReviews)
    .map((r) => {
      const u = r.users as unknown as { name: string; handle: string; avatar_url: string | null } | null;
      return { stars: Number(r.stars), review: r.review as string, tags: Array.isArray(r.tags) ? (r.tags as string[]) : [], createdAt: r.created_at as string, albumId: r.album_id as string, user: { id: r.user_id as string, name: u?.name ?? '', handle: u?.handle ?? '', avatarUrl: u?.avatar_url ?? null } };
    });
  return NextResponse.json({ reviews, next: raw.length < PAGE ? null : from + PAGE });
}
