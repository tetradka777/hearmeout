import { NextRequest, NextResponse } from 'next/server';
import { LANGUAGES } from '@/lib/i18n';
import { getCurrentUserId } from '@/lib/identity';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { pushConfigured } from '@/lib/push';

// Notifications on this device: GET tells whether push is set up on the
// server, POST saves this browser's subscription, DELETE removes it.
export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'not_registered' }, { status: 401 });
  return NextResponse.json({ configured: pushConfigured(), publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null });
}

export async function POST(request: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'not_registered' }, { status: 401 });
  if (!pushConfigured()) return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  const body = await request.json().catch(() => null);
  const sub = body?.subscription;
  const endpoint = typeof sub?.endpoint === 'string' ? sub.endpoint : '';
  const p256dh = typeof sub?.keys?.p256dh === 'string' ? sub.keys.p256dh : '';
  const auth = typeof sub?.keys?.auth === 'string' ? sub.keys.auth : '';
  // Push services are https endpoints; anything else isn't a subscription.
  if (!/^https:\/\//.test(endpoint) || endpoint.length > 1000 || !p256dh || !auth || p256dh.length > 200 || auth.length > 100) {
    return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
  }
  const language = (LANGUAGES as readonly string[]).includes(body?.language) ? body.language : null;
  const { error } = await supabaseAdmin()
    .from('push_subscriptions')
    .upsert({ user_id: userId, endpoint, p256dh, auth, language }, { onConflict: 'endpoint' });
  if (error) return NextResponse.json({ error: 'not_ready' }, { status: 503 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'not_registered' }, { status: 401 });
  const body = await request.json().catch(() => null);
  const endpoint = typeof body?.endpoint === 'string' ? body.endpoint : '';
  if (!endpoint) return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
  await supabaseAdmin().from('push_subscriptions').delete().eq('user_id', userId).eq('endpoint', endpoint);
  return NextResponse.json({ ok: true });
}
