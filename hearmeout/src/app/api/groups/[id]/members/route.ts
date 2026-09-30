import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUserId } from '@/lib/identity';

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'not_registered' }, { status: 401 });
  const { id } = await context.params;

  const admin = supabaseAdmin();
  const { data: membership } = await admin.from('group_members').select('user_id').eq('group_id', id).eq('user_id', userId).maybeSingle();
  if (!membership) return NextResponse.json({ error: 'not_a_member' }, { status: 403 });

  const body = await request.json().catch(() => null);
  const raw = typeof body?.handle === 'string' ? body.handle.trim() : '';
  if (!raw) return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
  const normalized = raw.startsWith('@') ? raw : `@${raw}`;

  const { data: target } = await admin.from('users').select('id, name, handle, avatar_url').ilike('handle', normalized).maybeSingle();
  if (!target) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const { data: existing } = await admin.from('group_members').select('user_id').eq('group_id', id).eq('user_id', target.id).maybeSingle();
  if (existing) return NextResponse.json({ error: 'already_member' }, { status: 409 });

  const { error } = await admin.from('group_members').insert({ group_id: id, user_id: target.id });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, user: { id: target.id, name: target.name, handle: target.handle, avatarUrl: target.avatar_url } });
}
