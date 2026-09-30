import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUserId } from '@/lib/identity';
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
    admin.from('groups').select('id, name').in('id', groupIds),
    admin.from('group_members').select('group_id, user_id').in('group_id', groupIds),
  ]);

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const summaries: GroupSummary[] = [];
  for (const g of groups || []) {
    const memberIds = (allMembers || []).filter((m) => m.group_id === g.id).map((m) => m.user_id as string);
    const { count } = await admin
      .from('ratings')
      .select('*', { count: 'exact', head: true })
      .in('user_id', memberIds)
      .gte('created_at', since);
    summaries.push({ id: g.id, name: g.name, memberCount: memberIds.length, newPlays: count || 0 });
  }
  return NextResponse.json(summaries);
}

export async function POST(request: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'not_registered' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 60) : '';
  if (!name) return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });

  const admin = supabaseAdmin();

  const { data: group, error } = await admin.from('groups').insert({ name, created_by: userId }).select('id, name').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { error: memberErr } = await admin.from('group_members').insert({ group_id: group.id, user_id: userId });
  if (memberErr) return NextResponse.json({ error: memberErr.message }, { status: 500 });

  return NextResponse.json({ id: group.id, name: group.name });
}
