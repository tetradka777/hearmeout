import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/identity';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { allowedTargets, isMissingTable, targetOwner } from '@/lib/social';
import { REACTIONS, type ReactionKind } from '@/lib/reactions';

const NOTIFY_COOLDOWN_MS = 60 * 60 * 1000; // one "reacted" notification per person per target an hour

// Toggles a reaction: POST { target, kind } -> { on }. Adding one tells
// the owner (an in-app notification), at most once an hour per target.
export async function POST(request: NextRequest) {
  const viewerId = await getCurrentUserId();
  if (!viewerId) return NextResponse.json({ error: 'not_registered' }, { status: 401 });
  const body = await request.json().catch(() => null) as { target?: unknown; kind?: unknown } | null;
  const target = typeof body?.target === 'string' ? body.target : '';
  const kind = body?.kind as ReactionKind;
  if (!target || !REACTIONS.includes(kind)) return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
  const admin = supabaseAdmin();
  const parsed = (await allowedTargets(admin, viewerId, [target])).get(target);
  if (!parsed) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const { data: existing, error } = await admin.from('social_reactions').select('kind').eq('target', target).eq('user_id', viewerId).eq('kind', kind).maybeSingle();
  if (isMissingTable(error)) return NextResponse.json({ error: 'not_ready' }, { status: 503 });
  if (error) return NextResponse.json({ error: 'failed' }, { status: 500 });
  if (existing) {
    await admin.from('social_reactions').delete().eq('target', target).eq('user_id', viewerId).eq('kind', kind);
    return NextResponse.json({ on: false });
  }
  const ins = await admin.from('social_reactions').insert({ target, user_id: viewerId, kind });
  if (ins.error) return NextResponse.json({ error: 'failed' }, { status: 500 });

  const owner = targetOwner(parsed);
  if (owner && owner !== viewerId) {
    const since = new Date(Date.now() - NOTIFY_COOLDOWN_MS).toISOString();
    const { data: recent } = await admin.from('notifications').select('id').eq('user_id', owner).eq('actor_id', viewerId).eq('kind', 'reaction').eq('payload->>target', target).gte('created_at', since).limit(1);
    if (!recent?.length) await admin.from('notifications').insert({ user_id: owner, actor_id: viewerId, kind: 'reaction', payload: { target, reaction: kind } });
  }
  return NextResponse.json({ on: true });
}
