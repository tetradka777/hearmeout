import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUserId } from '@/lib/identity';
import { acceptFriendRequest } from '@/lib/friendRequests';
import { isDemoAccountId } from '@/lib/demoAccounts';

// Sends a friend request (pending, needs the other side to accept) rather
// than adding instantly — replaces the old instant-mutual-add behavior.
export async function POST(request: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'not_registered' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const raw = typeof body?.handle === 'string' ? body.handle.trim() : '';
  if (!raw) return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
  const normalized = raw.startsWith('@') ? raw : `@${raw}`;

  const admin = supabaseAdmin();
  const { data: target, error: findErr } = await admin
    .from('users')
    .select('id, name, handle, avatar_url')
    .ilike('handle', normalized)
    .maybeSingle();
  if (findErr) return NextResponse.json({ error: findErr.message }, { status: 500 });
  if (!target) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (target.id === userId) return NextResponse.json({ error: 'self' }, { status: 400 });
  if (isDemoAccountId(target.id)) return NextResponse.json({ error: 'demo_account' }, { status: 400 });

  const { data: existingFriendship } = await admin
    .from('friendships')
    .select('user_id')
    .eq('user_id', userId)
    .eq('friend_id', target.id)
    .maybeSingle();
  if (existingFriendship) return NextResponse.json({ error: 'already_friends' }, { status: 409 });

  // A pending request already waiting the other way just gets auto-accepted
  // — both people wanted this, no need to make them click twice.
  const { data: reciprocal } = await admin
    .from('friend_requests')
    .select('id, status')
    .eq('from_user_id', target.id)
    .eq('to_user_id', userId)
    .maybeSingle();
  if (reciprocal && reciprocal.status === 'pending') {
    await acceptFriendRequest(admin, reciprocal.id, target.id, userId);
    return NextResponse.json({ ok: true, status: 'accepted', user: { id: target.id, name: target.name, handle: target.handle, avatarUrl: target.avatar_url } });
  }

  const { error: upsertErr } = await admin
    .from('friend_requests')
    .upsert({ from_user_id: userId, to_user_id: target.id, status: 'pending' }, { onConflict: 'from_user_id,to_user_id' });
  if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, status: 'pending', user: { id: target.id, name: target.name, handle: target.handle, avatarUrl: target.avatar_url } });
}

// Unfriend (spec 6.4 "Friends ✓ → Remove", after an inline confirm). Drops
// both directions of the friendship and any request rows between the two,
// so either side can send a fresh request later.
export async function DELETE(request: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'not_registered' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const friendId = typeof body?.friendId === 'string' ? body.friendId : '';
  // Strict UUID check: the id is interpolated into PostgREST .or() filter
  // strings below, so nothing else may get through.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(friendId) || friendId === userId) {
    return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { error } = await admin
    .from('friendships')
    .delete()
    .or(`and(user_id.eq.${userId},friend_id.eq.${friendId}),and(user_id.eq.${friendId},friend_id.eq.${userId})`);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await admin
    .from('friend_requests')
    .delete()
    .or(`and(from_user_id.eq.${userId},to_user_id.eq.${friendId}),and(from_user_id.eq.${friendId},to_user_id.eq.${userId})`);

  return NextResponse.json({ ok: true });
}
