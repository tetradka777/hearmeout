import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { IDENTITY_COOKIE, forgetSessionVersion, getCurrentUserId } from '@/lib/identity';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

// "Sign out on all devices": raises the account's session_version, so every
// cookie issued before (any phone, any browser, a stolen one) stops working,
// and signs this device out too. Needs migration 027.
export async function POST() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'not_registered' }, { status: 401 });
  const admin = supabaseAdmin();
  const { data, error } = await admin.from('users').select('session_version').eq('id', userId).maybeSingle();
  if (error || typeof data?.session_version !== 'number') return NextResponse.json({ error: 'not_ready' }, { status: 503 });
  const { error: updErr } = await admin.from('users').update({ session_version: data.session_version + 1 }).eq('id', userId);
  if (updErr) return NextResponse.json({ error: 'not_ready' }, { status: 503 });
  forgetSessionVersion(userId);
  (await cookies()).delete(IDENTITY_COOKIE);
  return NextResponse.json({ ok: true });
}
