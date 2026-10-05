import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUserId } from '@/lib/identity';

// Mute notifications for this group (prototype's hero "Mute notifications"
// toggle, spec gap) — per member, per group; see migration_018.
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'not_registered' }, { status: 401 });
  const { id } = await context.params;

  const body = await request.json().catch(() => null);
  if (typeof body?.muted !== 'boolean') return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: membership } = await admin.from('group_members').select('user_id').eq('group_id', id).eq('user_id', userId).maybeSingle();
  if (!membership) return NextResponse.json({ error: 'not_a_member' }, { status: 403 });

  const { error } = await admin.from('group_members').update({ muted: body.muted }).eq('group_id', id).eq('user_id', userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, muted: body.muted });
}
