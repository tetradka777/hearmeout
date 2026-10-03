import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUserId } from '@/lib/identity';

const ITEM_TYPES = new Set(['album', 'track']);

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'not_registered' }, { status: 401 });
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from('listen_later')
    .select('id, item_type, album_id, track_index, title, artist, cover_url, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const items = (data || []).map((r) => ({
    id: r.id, type: r.item_type, albumId: r.album_id, trackIndex: r.track_index, title: r.title, artist: r.artist, cover: r.cover_url, createdAt: r.created_at,
  }));
  return NextResponse.json({ items });
}

// Toggle — saving an already-saved album or track removes it (spec
// 13.20 rule 1: one entry per album/track, the control is a toggle).
export async function POST(request: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'not_registered' }, { status: 401 });
  const body = await request.json().catch(() => null);
  const type = typeof body?.type === 'string' ? body.type : null;
  const albumId = typeof body?.albumId === 'string' ? body.albumId : null;
  const title = typeof body?.title === 'string' ? body.title : null;
  if (!type || !ITEM_TYPES.has(type) || !albumId || !title) return NextResponse.json({ error: 'missing_fields' }, { status: 400 });
  const trackIndex = type === 'track' && Number.isInteger(body?.trackIndex) ? body.trackIndex : null;
  const artist = typeof body?.artist === 'string' ? body.artist : null;
  const cover = typeof body?.cover === 'string' ? body.cover : null;

  const admin = supabaseAdmin();
  let existingQuery = admin.from('listen_later').select('id').eq('user_id', userId).eq('item_type', type).eq('album_id', albumId);
  existingQuery = trackIndex === null ? existingQuery.is('track_index', null) : existingQuery.eq('track_index', trackIndex);
  const { data: existing, error: lookupErr } = await existingQuery.maybeSingle();
  if (lookupErr) return NextResponse.json({ error: lookupErr.message }, { status: 500 });

  if (existing) {
    const { error } = await admin.from('listen_later').delete().eq('id', existing.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ saved: false });
  }
  const { error } = await admin.from('listen_later').insert({
    user_id: userId, item_type: type, album_id: albumId, track_index: trackIndex, title, artist, cover_url: cover,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ saved: true });
}

// Remove all (spec 13.20 "Remove all N saved items?").
export async function DELETE() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'not_registered' }, { status: 401 });
  const admin = supabaseAdmin();
  const { error } = await admin.from('listen_later').delete().eq('user_id', userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
