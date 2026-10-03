import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUserId } from '@/lib/identity';
import type { ApiUser } from '@/lib/types';

// Reviews tab on the artist page (spec 6.7): your friends' written reviews
// of this artist's albums. ratings has no artist column (album -> artist
// only exists in Spotify data), so the client passes the album ids it
// already has for the artist. Private ratings never leave their owner.
export async function GET(request: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'not_registered' }, { status: 401 });
  const albumIds = (new URL(request.url).searchParams.get('albums') || '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 50);
  if (!albumIds.length) return NextResponse.json({ reviews: [] });

  const admin = supabaseAdmin();
  const { data: friendRows } = await admin.from('friendships').select('friend:friend_id(id, name, handle, avatar_url)').eq('user_id', userId);
  const friends = new Map<string, ApiUser>();
  for (const row of friendRows || []) {
    const f = row.friend as unknown as { id: string; name: string; handle: string; avatar_url: string | null } | null;
    if (f) friends.set(f.id, { id: f.id, name: f.name, handle: f.handle, avatarUrl: f.avatar_url });
  }
  if (!friends.size) return NextResponse.json({ reviews: [] });

  const { data, error } = await admin
    .from('ratings')
    .select('user_id, album_id, stars, review, created_at, is_private')
    .in('user_id', [...friends.keys()])
    .in('album_id', albumIds)
    .not('review', 'is', null)
    .order('created_at', { ascending: false })
    .limit(30);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const reviews = (data || [])
    .filter((r) => !r.is_private && typeof r.review === 'string' && r.review.trim())
    .map((r) => ({ user: friends.get(r.user_id as string)!, albumId: r.album_id as string, stars: Number(r.stars), review: r.review as string, createdAt: r.created_at as string }));
  return NextResponse.json({ reviews });
}
