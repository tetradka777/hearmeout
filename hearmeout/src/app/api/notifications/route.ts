import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUserId } from '@/lib/identity';
import type { AppNotification, RecapPeriod } from '@/lib/types';

// In-app notifications (migration 021): "Say hi" from a friend's profile
// and "Send to friends" from the recap. Only friends can be notified, and
// both are rate-limited so a button can't be used to spam.
const HI_COOLDOWN_MS = 60 * 60 * 1000;          // one hi per friend per hour
const RECAP_COOLDOWN_MS = 24 * 60 * 60 * 1000;  // one recap share per day
const PERIODS: RecapPeriod[] = ['day', 'week', 'month', 'season'];

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'not_registered' }, { status: 401 });
  const { data, error } = await supabaseAdmin()
    .from('notifications')
    .select('id, kind, payload, created_at, read_at, actor:actor_id(id, name, handle, avatar_url)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(30);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const items: AppNotification[] = (data || []).flatMap((n) => {
    const a = n.actor as unknown as { id: string; name: string; handle: string; avatar_url: string | null } | null;
    if (!a) return [];
    return [{
      id: n.id as number,
      kind: n.kind as AppNotification['kind'],
      payload: (n.payload || {}) as AppNotification['payload'],
      createdAt: n.created_at as string,
      read: !!n.read_at,
      actor: { id: a.id, name: a.name, handle: a.handle, avatarUrl: a.avatar_url },
    }];
  });
  return NextResponse.json({ items, unread: items.filter((n) => !n.read).length });
}

export async function POST(request: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'not_registered' }, { status: 401 });
  const body = await request.json().catch(() => null);
  const admin = supabaseAdmin();

  const { data: friendRows } = await admin.from('friendships').select('friend_id').eq('user_id', userId);
  const friendIds = new Set((friendRows || []).map((r) => r.friend_id as string));

  if (body?.kind === 'hi') {
    const to = typeof body.to === 'string' ? body.to : '';
    if (!friendIds.has(to)) return NextResponse.json({ error: 'not_friends' }, { status: 403 });
    const since = new Date(Date.now() - HI_COOLDOWN_MS).toISOString();
    const { data: recent } = await admin.from('notifications').select('id').eq('actor_id', userId).eq('user_id', to).eq('kind', 'hi').gte('created_at', since).limit(1);
    if (recent?.length) return NextResponse.json({ error: 'too_soon' }, { status: 429 });
    const { error } = await admin.from('notifications').insert({ user_id: to, actor_id: userId, kind: 'hi' });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ sent: 1 });
  }

  if (body?.kind === 'recap') {
    const period: RecapPeriod = PERIODS.includes(body.period) ? body.period : 'week';
    const offset = Number.isInteger(body.offset) ? Math.max(-52, Math.min(0, body.offset)) : 0;
    if (!friendIds.size) return NextResponse.json({ sent: 0 });
    const since = new Date(Date.now() - RECAP_COOLDOWN_MS).toISOString();
    const { data: recent } = await admin.from('notifications').select('id').eq('actor_id', userId).eq('kind', 'recap').gte('created_at', since).limit(1);
    if (recent?.length) return NextResponse.json({ error: 'too_soon' }, { status: 429 });
    const rows = [...friendIds].map((to) => ({ user_id: to, actor_id: userId, kind: 'recap', payload: { period, offset } }));
    const { error } = await admin.from('notifications').insert(rows);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ sent: rows.length });
  }

  return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
}
