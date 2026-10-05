import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUserId } from '@/lib/identity';
import { handleIlikePattern } from '@/lib/slug';
import type { GroupSummary } from '@/lib/types';

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'not_registered' }, { status: 401 });

  const admin = supabaseAdmin();
  const { data: memberships, error } = await admin.from('group_members').select('group_id').eq('user_id', userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const groupIds = (memberships || []).map((m) => m.group_id as string);
  if (!groupIds.length) return NextResponse.json([]);

  const [{ data: groups }, { data: allMembers }] = await Promise.all([
    admin.from('groups').select('id, name, created_at').in('id', groupIds),
    admin.from('group_members').select('group_id, user_id').in('group_id', groupIds),
  ]);

  const allMemberIds = [...new Set((allMembers || []).map((m) => m.user_id as string))];
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  // vGroups() list cards show the member avatar row and "Listened most this
  // week: {name} · {hours}h" — both missing before, even though the data
  // (users + this-week listening_events) is the same the group detail page
  // already fetches per group.
  const [{ data: users }, { data: weekEvents }] = await Promise.all([
    admin.from('users').select('id, name, handle, avatar_url').in('id', allMemberIds),
    admin.from('listening_events').select('user_id, duration_ms').in('user_id', allMemberIds).gte('played_at', since),
  ]);
  const userById = new Map((users || []).map((u) => [u.id as string, { id: u.id as string, name: u.name as string, handle: u.handle as string, avatarUrl: u.avatar_url as string | null }]));
  const hoursByUser = new Map<string, number>();
  for (const e of weekEvents || []) {
    const k = e.user_id as string;
    hoursByUser.set(k, (hoursByUser.get(k) || 0) + (e.duration_ms || 0));
  }

  const summaries: GroupSummary[] = [];
  for (const g of groups || []) {
    const memberIds = (allMembers || []).filter((m) => m.group_id === g.id).map((m) => m.user_id as string);
    const { count } = await admin
      .from('ratings')
      .select('*', { count: 'exact', head: true })
      .in('user_id', memberIds)
      .gte('created_at', since);
    const members = memberIds.map((id) => userById.get(id)).filter((u): u is NonNullable<typeof u> => !!u);
    const ranked = members
      .map((user) => ({ user, hours: Math.round(((hoursByUser.get(user.id) || 0) / 3600000) * 10) / 10 }))
      .sort((a, b) => b.hours - a.hours);
    const topListener = ranked.length && ranked[0].hours > 0 ? ranked[0] : null;
    summaries.push({ id: g.id, name: g.name, memberCount: memberIds.length, newPlays: count || 0, createdAt: g.created_at as string, members, topListener });
  }
  return NextResponse.json(summaries);
}

export async function POST(request: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'not_registered' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  // Spec 6.6 "New group" modal: name 2–30 characters, optional first invite.
  if (name.length < 2 || name.length > 30) return NextResponse.json({ error: 'name_length' }, { status: 400 });
  const rawInvite = typeof body?.firstInvite === 'string' ? body.firstInvite.trim() : '';

  const admin = supabaseAdmin();

  // Resolve the optional first invitee before creating anything, so an
  // unknown handle doesn't leave a half-made group behind.
  let inviteeId: string | null = null;
  if (rawInvite) {
    const { data: target } = await admin.from('users').select('id').ilike('handle', handleIlikePattern(rawInvite)).maybeSingle();
    if (!target) return NextResponse.json({ error: 'invite_not_found' }, { status: 404 });
    if (target.id !== userId) inviteeId = target.id;
  }

  const { data: group, error } = await admin.from('groups').insert({ name, created_by: userId }).select('id, name').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = [{ group_id: group.id, user_id: userId }, ...(inviteeId ? [{ group_id: group.id, user_id: inviteeId }] : [])];
  const { error: memberErr } = await admin.from('group_members').insert(rows);
  if (memberErr) return NextResponse.json({ error: memberErr.message }, { status: 500 });

  return NextResponse.json({ id: group.id, name: group.name });
}
