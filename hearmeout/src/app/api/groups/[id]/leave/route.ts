import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUserId } from '@/lib/identity';

// Leave group (spec 6.6 item 12): removes only this member's row — a
// group someone else created keeps existing for the rest, and the
// leaver's own ratings stay on their profile untouched.
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'not_registered' }, { status: 401 });
  const { id } = await context.params;

  const admin = supabaseAdmin();
  const { error } = await admin.from('group_members').delete().eq('group_id', id).eq('user_id', userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
