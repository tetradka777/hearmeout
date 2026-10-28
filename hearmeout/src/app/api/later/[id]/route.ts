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

const REPEATS = new Set(['day', 'week', 'month']);
const MAX_AHEAD_MS = 366 * 86400000;

// The item's reminder (migration 035): { remindAt: ISO time | null, every:
// 'day' | 'week' | 'month' | null }. remindAt null turns it off.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'not_registered' }, { status: 401 });
  const { id } = await params;
  const body = await request.json().catch(() => null);
  let remindAt: string | null = null;
  if (body?.remindAt != null) {
    const at = typeof body.remindAt === 'string' ? Date.parse(body.remindAt) : NaN;
    // A minute of slack for "in a moment"; no further than a year ahead.
    if (!Number.isFinite(at) || at < Date.now() - 60000 || at > Date.now() + MAX_AHEAD_MS) return NextResponse.json({ error: 'bad_time' }, { status: 400 });
    remindAt = new Date(at).toISOString();
  }
  const every = remindAt && typeof body?.every === 'string' && REPEATS.has(body.every) ? body.every : null;
  const { data, error } = await supabaseAdmin().from('listen_later')
    .update({ remind_at: remindAt, remind_every: every })
    .eq('user_id', userId).eq('id', id).select('id');
  if (error) return NextResponse.json({ error: /remind_/.test(error.message) ? 'not_ready' : error.message }, { status: /remind_/.test(error.message) ? 503 : 500 });
  if (!data?.length) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ ok: true, remindAt, every });
}
