import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUserId } from '@/lib/identity';
import type { AppNotification, RecapPeriod } from '@/lib/types';
import { sendPush } from '@/lib/push';

// In-app notifications (migration 021): "Say hi" from a friend's profile
// and "Send to friends" from the recap; new releases (migration 028,
// lib/releaseNotify) come from the site itself and have no actor; an album
// a friend shared (migration 032). Only friends can be notified, and
// both are rate-limited so a button can't be used to spam.
const HI_COOLDOWN_MS = 60 * 60 * 1000;          // one hi per friend per hour
const RECAP_COOLDOWN_MS = 24 * 60 * 60 * 1000;  // one recap share per day
const ALBUM_SHARE_COOLDOWN_MS = 60 * 60 * 1000; // the same album to the same friend once an hour
const ALBUM_SHARES_PER_HOUR = 40;              // album shares sent per hour in all
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
    if (!a && n.kind !== 'release' && n.kind !== 'later') return [];
    return [{
      id: n.id as number,
      kind: n.kind as AppNotification['kind'],
      payload: (n.payload || {}) as AppNotification['payload'],
      createdAt: n.created_at as string,
      read: !!n.read_at,
      actor: a ? { id: a.id, name: a.name, handle: a.handle, avatarUrl: a.avatar_url } : null,
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
    const { error } = await admin.from('notifications').insert({ user_id: to, actor_id: userId, kind: 'hi', payload: {} });
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

  // "Share album" (migration 032): an album sent to some of your friends,
  // with an optional note; each gets a notification and a push.
  if (body?.kind === 'album') {
    const albumId = typeof body.albumId === 'string' ? body.albumId.slice(0, 64) : '';
    const title = typeof body.title === 'string' ? body.title.slice(0, 300) : '';
    const artist = typeof body.artist === 'string' ? body.artist.slice(0, 200) : '';
    const cover = typeof body.cover === 'string' && /^https:\/\//.test(body.cover) ? body.cover.slice(0, 500) : null;
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, 200) : '';
    const to = Array.isArray(body.to) ? [...new Set((body.to as unknown[]).filter((x): x is string => typeof x === 'string' && friendIds.has(x)))].slice(0, 20) : [];
    if (!albumId || !title || !to.length) return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
    const hourAgo = new Date(Date.now() - ALBUM_SHARE_COOLDOWN_MS).toISOString();
    const { data: recent } = await admin.from('notifications').select('user_id, payload').eq('actor_id', userId).eq('kind', 'album').gte('created_at', hourAgo).limit(200);
    if ((recent?.length ?? 0) + to.length > ALBUM_SHARES_PER_HOUR) return NextResponse.json({ error: 'too_soon' }, { status: 429 });
    const already = new Set((recent || []).filter((r) => (r.payload as { albumId?: string } | null)?.albumId === albumId).map((r) => r.user_id as string));
    const targets = to.filter((id) => !already.has(id));
    if (!targets.length) return NextResponse.json({ sent: 0, already: to.length });
    const payload = { albumId, title, artist, cover, ...(note ? { note } : {}) };
    const { error } = await admin.from('notifications').insert(targets.map((id) => ({ user_id: id, actor_id: userId, kind: 'album', payload })));
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const { data: me } = await admin.from('users').select('name').eq('id', userId).maybeSingle();
    await sendPush(targets, {
      titleKey: 'push.albumShareTitle',
      bodyKey: note ? 'push.albumShareBodyNote' : 'push.albumShareBody',
      vars: { name: (me?.name as string | undefined) ?? '', title, artist, note },
      url: `/?screen=rate&id=${encodeURIComponent(albumId)}`,
      tag: `album-${albumId}`,
    }).catch(() => 0);
    return NextResponse.json({ sent: targets.length });
  }

  return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
}
