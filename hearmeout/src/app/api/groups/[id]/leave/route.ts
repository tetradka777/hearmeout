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

  // The last one out removes the group (and with it its votes and mutes),
  // instead of leaving an empty group in the database for good.
  const { count } = await admin.from('group_members').select('user_id', { count: 'exact', head: true }).eq('group_id', id);
  if (count === 0) await admin.from('groups').delete().eq('id', id);

  return NextResponse.json({ ok: true });
}
