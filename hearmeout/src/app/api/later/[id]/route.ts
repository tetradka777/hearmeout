import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUserId } from '@/lib/identity';

// Remove one item (spec 13.20: used by both the Listened and Remove
// buttons on /later — they differ only in the toast and, for an album,
// Listened also opens the rating screen).
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'not_registered' }, { status: 401 });
  const { id } = await params;
  const admin = supabaseAdmin();
  const { error } = await admin.from('listen_later').delete().eq('user_id', userId).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
