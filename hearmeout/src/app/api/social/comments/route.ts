import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/identity';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { allowedTargets, isMissingTable, targetOwner } from '@/lib/social';
import { hit, underLimit } from '@/lib/rateLimit';

export type SocialComment = { id: number; body: string; createdAt: string; user: { id: string; name: string; handle: string; avatarUrl: string | null }; canDelete: boolean };

// Comments on one target: GET ?target= lists them (oldest first), POST
// { target, body } adds one and tells the owner, DELETE ?id= removes one
// (its author or the owner of what it's on).
export async function GET(request: NextRequest) {
  const viewerId = await getCurrentUserId();
  if (!viewerId) return NextResponse.json({ error: 'not_registered' }, { status: 401 });
  const target = new URL(request.url).searchParams.get('target') || '';
  const admin = supabaseAdmin();
  const parsed = (await allowedTargets(admin, viewerId, [target])).get(target);
  if (!parsed) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const { data, error } = await admin
    .from('social_comments')
    .select('id, body, created_at, user_id, users(name, handle, avatar_url)')
    .eq('target', target)
    .order('created_at', { ascending: true })
    .limit(200);
  if (isMissingTable(error)) return NextResponse.json({ comments: [], ready: false });
  if (error) return NextResponse.json({ error: 'failed' }, { status: 500 });
  const owner = targetOwner(parsed);
  const comments: SocialComment[] = (data || []).map((c) => {
    const u = c.users as unknown as { name: string; handle: string; avatar_url: string | null } | null;
    return {
      id: c.id as number,
      body: c.body as string,
      createdAt: c.created_at as string,
      user: { id: c.user_id as string, name: u?.name ?? '', handle: u?.handle ?? '', avatarUrl: u?.avatar_url ?? null },
      canDelete: c.user_id === viewerId || owner === viewerId,
    };
  });
  return NextResponse.json({ comments, ready: true });
}

export async function POST(request: NextRequest) {
  const viewerId = await getCurrentUserId();
  if (!viewerId) return NextResponse.json({ error: 'not_registered' }, { status: 401 });
  // Twenty comments in ten minutes is plenty for a person.
  if (!underLimit(`comment:${viewerId}`, 20, 10 * 60 * 1000)) return NextResponse.json({ error: 'too_many' }, { status: 429 });
  hit(`comment:${viewerId}`);
  const body = await request.json().catch(() => null) as { target?: unknown; body?: unknown } | null;
  const target = typeof body?.target === 'string' ? body.target : '';
  const text = typeof body?.body === 'string' ? body.body.trim().slice(0, 500) : '';
  if (!target || !text) return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
  const admin = supabaseAdmin();
  const parsed = (await allowedTargets(admin, viewerId, [target])).get(target);
  if (!parsed) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const { data, error } = await admin.from('social_comments').insert({ target, user_id: viewerId, body: text }).select('id').single();
  if (isMissingTable(error)) return NextResponse.json({ error: 'not_ready' }, { status: 503 });
  if (error) return NextResponse.json({ error: 'failed' }, { status: 500 });
  const owner = targetOwner(parsed);
  if (owner && owner !== viewerId) {
    await admin.from('notifications').insert({ user_id: owner, actor_id: viewerId, kind: 'comment', payload: { target, preview: text.slice(0, 80) } });
  }
  return NextResponse.json({ id: data.id });
}

export async function DELETE(request: NextRequest) {
  const viewerId = await getCurrentUserId();
  if (!viewerId) return NextResponse.json({ error: 'not_registered' }, { status: 401 });
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
  const admin = supabaseAdmin();
  const { data: c, error } = await admin.from('social_comments').select('id, target, user_id').eq('id', id).maybeSingle();
  if (isMissingTable(error)) return NextResponse.json({ error: 'not_ready' }, { status: 503 });
  if (!c) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const parsed = (await allowedTargets(admin, viewerId, [c.target as string])).get(c.target as string);
  const owner = parsed ? targetOwner(parsed) : null;
  if (c.user_id !== viewerId && owner !== viewerId) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  await admin.from('social_comments').delete().eq('id', id);
  return NextResponse.json({ ok: true });
}
