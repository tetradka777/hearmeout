import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUserId } from '@/lib/identity';

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'not_registered' }, { status: 401 });
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from('wishlist')
    .select('album_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const albumIds = (data || []).map((r) => r.album_id as string);
  return NextResponse.json({ albumIds });
}

// Toggle — wishlisting an already-wishlisted album un-wishlists it, same
// shape as /api/loved's toggle.
export async function POST(request: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'not_registered' }, { status: 401 });
  const body = await request.json().catch(() => null);
  const albumId = typeof body?.albumId === 'string' ? body.albumId : null;
  if (!albumId) return NextResponse.json({ error: 'missing_fields' }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: existing, error: lookupErr } = await admin
    .from('wishlist')
    .select('id')
    .eq('user_id', userId)
    .eq('album_id', albumId)
    .maybeSingle();
  if (lookupErr) return NextResponse.json({ error: lookupErr.message }, { status: 500 });

  if (existing) {
    const { error } = await admin.from('wishlist').delete().eq('id', existing.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ wishlisted: false });
  }
  const { error } = await admin.from('wishlist').insert({ user_id: userId, album_id: albumId });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ wishlisted: true });
}
