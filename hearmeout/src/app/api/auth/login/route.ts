import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { setCurrentUserId, hasSessionSecret } from '@/lib/identity';
import { clientIp, hit, underLimit } from '@/lib/rateLimit';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS_PER_HANDLE = 8;
const MAX_FAILS_PER_IP = 30;

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const rawHandle = typeof body?.handle === 'string' ? body.handle.trim() : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  if (!hasSessionSecret()) {
    console.error('login: SESSION_SECRET is missing or shorter than 32 characters');
    return NextResponse.json({ error: 'server_config' }, { status: 500 });
  }
  if (!rawHandle || !password) return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });

  const handle = `@${rawHandle.replace(/^@/, '').toLowerCase()}`;
  // Failed attempts are limited per account and per address (lib/rateLimit).
  const ipKey = `login-ip:${clientIp(request)}`;
  const handleKey = `login-handle:${handle}`;
  if (!underLimit(ipKey, MAX_FAILS_PER_IP, WINDOW_MS) || !underLimit(handleKey, MAX_FAILS_PER_HANDLE, WINDOW_MS)) {
    return NextResponse.json({ error: 'too_many_attempts' }, { status: 429 });
  }
  const fail = (body: { error: string }, status: number) => { hit(ipKey); hit(handleKey); return NextResponse.json(body, { status }); };

  const admin = supabaseAdmin();
  const { data: userRow } = await admin
    .from('users')
    .select('id, name, handle, avatar_url, auth_user_id')
    .eq('handle', handle)
    .maybeSingle();
  if (!userRow) return fail({ error: 'invalid_credentials' }, 401);
  if (!userRow.auth_user_id) return NextResponse.json({ error: 'account_not_linked' }, { status: 404 });

  // signInWithPassword only takes an email/phone, never a user id — look up
  // the account's (possibly internal, never-shown) email to sign in with.
  const { data: authUser, error: getErr } = await admin.auth.admin.getUserById(userRow.auth_user_id as string);
  if (getErr || !authUser.user?.email) return fail({ error: 'invalid_credentials' }, 401);

  const { data, error } = await admin.auth.signInWithPassword({ email: authUser.user.email, password });
  if (error || !data.user) return fail({ error: 'invalid_credentials' }, 401);

  await setCurrentUserId(userRow.id);
  return NextResponse.json({ id: userRow.id, name: userRow.name, handle: userRow.handle, avatarUrl: userRow.avatar_url });
}
