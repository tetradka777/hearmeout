import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUserId } from '@/lib/identity';

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'not_registered' }, { status: 401 });

  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from('ratings')
    .select('album_id, stars, review, tags, created_at, is_private, previous_stars')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(
    (data || []).map((r) => ({
      albumId: r.album_id, stars: r.stars, review: r.review, tags: r.tags || [], createdAt: r.created_at,
      isPrivate: !!r.is_private, previousStars: r.previous_stars != null ? Number(r.previous_stars) : null,
    }))
  );
}
