import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { setCurrentUserId } from '@/lib/identity';
import { slugifyHandle } from '@/lib/slug';
import { isStrongEnoughPassword } from '@/lib/authValidation';
import { INTERNAL_EMAIL_DOMAIN } from '@/lib/authInternalEmail';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const password = typeof body?.password === 'string' ? body.password : '';

  if (!name) return NextResponse.json({ error: 'name_required' }, { status: 400 });
  if (!isStrongEnoughPassword(password)) return NextResponse.json({ error: 'weak_password' }, { status: 400 });

  const admin = supabaseAdmin();

  const base = slugifyHandle(name);
  let handle = `@${base}`;
  let suffix = 0;
  while (suffix < 50) {
    const { data: existing } = await admin.from('users').select('id').eq('handle', handle).maybeSingle();
    if (!existing) break;
    suffix += 1;
    handle = `@${base}${suffix}`;
  }

  // No real email is collected — Supabase Auth still requires one internally,
  // so we derive a private, never-emailed placeholder from the (unique)
  // handle instead of prompting the user for an address.
  const authEmail = `${handle.slice(1)}@${INTERNAL_EMAIL_DOMAIN}`;

  const { data: authData, error: authErr } = await admin.auth.admin.createUser({
    email: authEmail,
    password,
    email_confirm: true,
  });
  if (authErr || !authData.user) {
    return NextResponse.json({ error: authErr?.message || 'signup_failed' }, { status: 500 });
  }

  const { data: created, error: insertErr } = await admin
    .from('users')
    .insert({ name, handle, auth_user_id: authData.user.id })
    .select('id, name, handle, avatar_url')
    .single();
  if (insertErr || !created) {
    await admin.auth.admin.deleteUser(authData.user.id);
    return NextResponse.json({ error: insertErr?.message }, { status: 500 });
  }

  await setCurrentUserId(created.id);
  return NextResponse.json({ id: created.id, name: created.name, handle: created.handle, avatarUrl: created.avatar_url });
}
