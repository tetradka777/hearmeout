import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/identity';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { allowedTargets, isMissingTable } from '@/lib/social';
import { REACTIONS, type ReactionKind } from '@/lib/reactions';

const MAX_TARGETS = 40;

export type SocialSummary = { comments: number; reactions: Partial<Record<ReactionKind, number>>; mine: ReactionKind[] };

// Comment counts and reactions for many targets at once (the cards on a
// screen ask together): POST { targets: string[] } -> { [target]: summary }.
// Targets the viewer may not see are left out.
export async function POST(request: NextRequest) {
  const viewerId = await getCurrentUserId();
  if (!viewerId) return NextResponse.json({ error: 'not_registered' }, { status: 401 });
  const body = await request.json().catch(() => null) as { targets?: unknown } | null;
  const keys = Array.isArray(body?.targets) ? [...new Set(body.targets.filter((k): k is string => typeof k === 'string' && k.length <= 160))].slice(0, MAX_TARGETS) : [];
  if (!keys.length) return NextResponse.json({});
  const admin = supabaseAdmin();
  const allowed = [...(await allowedTargets(admin, viewerId, keys)).keys()];
  if (!allowed.length) return NextResponse.json({});

  const [comments, reactions] = await Promise.all([
    admin.from('social_comments').select('target').in('target', allowed).limit(5000),
    admin.from('social_reactions').select('target, kind, user_id').in('target', allowed).limit(5000),
  ]);
  if (isMissingTable(comments.error) || isMissingTable(reactions.error)) return NextResponse.json({});
  if (comments.error || reactions.error) return NextResponse.json({ error: 'failed' }, { status: 500 });

  const out: Record<string, SocialSummary> = {};
  for (const k of allowed) out[k] = { comments: 0, reactions: {}, mine: [] };
  for (const c of comments.data || []) out[c.target as string].comments++;
  for (const r of reactions.data || []) {
    const s = out[r.target as string];
    const kind = r.kind as ReactionKind;
    if (!REACTIONS.includes(kind)) continue;
    s.reactions[kind] = (s.reactions[kind] || 0) + 1;
    if (r.user_id === viewerId) s.mine.push(kind);
  }
  return NextResponse.json(out);
}
