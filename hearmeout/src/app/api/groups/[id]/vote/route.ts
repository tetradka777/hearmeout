import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUserId } from '@/lib/identity';

function monthStartISO(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

// Recomputes this month's top-3 candidate albums the same way GET
// /api/groups/[id] does, so a vote can be validated against a real
// candidate without trusting the client's copy of the list.
async function candidateAlbumIds(admin: ReturnType<typeof supabaseAdmin>, groupId: string): Promise<string[]> {
  const { data: memberRows } = await admin.from('group_members').select('user_id').eq('group_id', groupId);
  const memberIds = (memberRows || []).map((m) => m.user_id as string);
  const { data: monthRatings } = await admin.from('ratings').select('album_id, stars').in('user_id', memberIds).gte('created_at', monthStartISO()).limit(6000);
  const stats = new Map<string, { sum: number; count: number }>();
  for (const r of monthRatings || []) {
    const k = r.album_id as string;
    const cur = stats.get(k) || { sum: 0, count: 0 };
    cur.sum += Number(r.stars);
    cur.count += 1;
    stats.set(k, cur);
  }
  return [...stats.entries()]
    .map(([albumId, v]) => ({ albumId, avgScore: v.sum / v.count, count: v.count }))
    .sort((a, b) => b.count - a.count || b.avgScore - a.avgScore)
    .slice(0, 3)
    .map((a) => a.albumId);
}

// One vote per member per group per calendar month, on an album (spec 6.6
// item 8) — voting the same album again withdraws it, voting a different
// one moves it (handled client-side by calling DELETE then POST, or just
// POST again with the new id; see GroupScreen.tsx).
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'not_registered' }, { status: 401 });
  const { id } = await context.params;

  const admin = supabaseAdmin();
  const { data: membership } = await admin.from('group_members').select('user_id').eq('group_id', id).eq('user_id', userId).maybeSingle();
  if (!membership) return NextResponse.json({ error: 'not_a_member' }, { status: 403 });

  const body = await request.json().catch(() => null);
  const albumId = typeof body?.albumId === 'string' ? body.albumId : '';
  if (!albumId) return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });

  const candidates = await candidateAlbumIds(admin, id);
  if (!candidates.includes(albumId)) return NextResponse.json({ error: 'invalid_candidate' }, { status: 400 });

  const monthKey = new Date().toISOString().slice(0, 7);
  const { error } = await admin
    .from('group_votes')
    .upsert({ group_id: id, month_key: monthKey, voter_id: userId, candidate_id: albumId }, { onConflict: 'group_id,month_key,voter_id' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'not_registered' }, { status: 401 });
  const { id } = await context.params;

  const admin = supabaseAdmin();
  const monthKey = new Date().toISOString().slice(0, 7);
  const { error } = await admin.from('group_votes').delete().eq('group_id', id).eq('month_key', monthKey).eq('voter_id', userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
