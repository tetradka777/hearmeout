import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUserId, IDENTITY_COOKIE } from '@/lib/identity';
import { getUserProfile, fetchIsOpenProfile } from '@/lib/userProfile';
import { slugifyHandle } from '@/lib/slug';
import type { ApiUser, Me } from '@/lib/types';
import { isThemeId, isToxicity } from '@/lib/themes';
import { isInternalEmail } from '@/lib/authInternalEmail';

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'not_registered' }, { status: 401 });

  const admin = supabaseAdmin();
  const [profile, { data: prefs }, { data: conns }, { data: friendRows }, isOpenProfile] = await Promise.all([
    getUserProfile(admin, userId, userId),
    admin.from('users').select('language, region, auth_user_id, is_premium, banner_url, accent_theme, accent_toxicity').eq('id', userId).maybeSingle(),
    admin.from('connections').select('provider').eq('user_id', userId),
    admin.from('friendships').select('friend:friend_id(id, name, handle, avatar_url, is_premium)').eq('user_id', userId),
    fetchIsOpenProfile(admin, userId),
  ]);

  if (!profile) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const connSet = new Set((conns || []).map((c) => c.provider as string));
  const friends: ApiUser[] = (friendRows || [])
    .map((row): ApiUser | null => {
      const f = row.friend as unknown as { id: string; name: string; handle: string; avatar_url: string | null; is_premium: boolean | null } | null;
      return f ? { id: f.id, name: f.name, handle: f.handle, avatarUrl: f.avatar_url, isPremium: !!f.is_premium } : null;
    })
    .filter((f): f is ApiUser => f !== null);

  let email: string | null = null;
  if (prefs?.auth_user_id) {
    const { data: authUser } = await admin.auth.admin.getUserById(prefs.auth_user_id as string);
    const realEmail = authUser.user?.email ?? null;
    email = isInternalEmail(realEmail) ? null : realEmail;
  }

  const me: Me = {
    ...profile,
    connections: { spotify: connSet.has('spotify'), appleMusic: connSet.has('apple_music') },
    friends,
    language: (prefs?.language as Me['language']) || 'en',
    region: prefs?.region ?? null,
    hasPassword: !!prefs?.auth_user_id,
    email,
    isPremium: !!prefs?.is_premium,
    bannerUrl: (prefs?.banner_url as string | null) ?? null,
    accentTheme: (prefs?.accent_theme as string | null) ?? null,
    accentToxicity: (prefs?.accent_toxicity as string | null) ?? null,
    isOpenProfile,
  };
  return NextResponse.json(me);
}

export async function PATCH(request: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'not_registered' }, { status: 401 });

  const admin = supabaseAdmin();
  const body = await request.json().catch(() => null);
  const patch: Record<string, string | boolean | null> = {};
  if (typeof body?.name === 'string' && body.name.trim()) patch.name = body.name.trim();
  if (typeof body?.handle === 'string' && body.handle.trim()) {
    patch.handle = `@${slugifyHandle(body.handle.replace(/^@/, ''))}`;
  }
  if (typeof body?.avatarUrl === 'string') patch.avatar_url = body.avatarUrl;
  // Banner + accent theme/toxicity are premium features — real gate, not
  // just a hidden button: a direct PATCH from a non-premium account is
  // dropped silently rather than trusting the client to have hidden the UI.
  const wantsAccentTheme = typeof body?.accentTheme === 'string' && isThemeId(body.accentTheme);
  const wantsAccentToxicity = typeof body?.accentToxicity === 'string' && isToxicity(body.accentToxicity);
  if (typeof body?.bannerUrl === 'string' || wantsAccentTheme || wantsAccentToxicity) {
    const { data: prefs } = await admin.from('users').select('is_premium').eq('id', userId).maybeSingle();
    if (prefs?.is_premium) {
      if (typeof body.bannerUrl === 'string') patch.banner_url = body.bannerUrl;
      if (wantsAccentTheme) patch.accent_theme = body.accentTheme;
      if (wantsAccentToxicity) patch.accent_toxicity = body.accentToxicity;
    }
  }
  if (typeof body?.language === 'string' && ['ru', 'en', 'fr', 'es', 'de'].includes(body.language)) patch.language = body.language;
  if ('region' in (body ?? {})) patch.region = typeof body.region === 'string' && body.region ? body.region : null;
  if (typeof body?.isOpenProfile === 'boolean') patch.is_open_profile = body.isOpenProfile;
  if (!Object.keys(patch).length) return NextResponse.json({ ok: true });

  const { error } = await admin.from('users').update(patch).eq('id', userId);
  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'handle_taken' }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

// Deletes the account and every row of personal data tied to it (ratings,
// listening history, friendships in both directions, connections, etc.) —
// not just the users row. Groups this person created are left alone (other
// members' data shouldn't disappear because one member deleted their
// account); this user is just removed from group_members.
export async function DELETE() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'not_registered' }, { status: 401 });

  const admin = supabaseAdmin();
  const { data: user } = await admin.from('users').select('auth_user_id').eq('id', userId).maybeSingle();

  await Promise.all([
    admin.from('ratings').delete().eq('user_id', userId),
    admin.from('listening_events').delete().eq('user_id', userId),
    admin.from('loved_items').delete().eq('user_id', userId),
    admin.from('connections').delete().eq('user_id', userId),
    admin.from('group_members').delete().eq('user_id', userId),
    admin.from('friendships').delete().eq('user_id', userId),
    admin.from('friendships').delete().eq('friend_id', userId),
    admin.from('friend_requests').delete().eq('from_user_id', userId),
    admin.from('friend_requests').delete().eq('to_user_id', userId),
    admin.from('match_snapshots').delete().eq('user_id', userId),
    admin.from('match_snapshots').delete().eq('friend_id', userId),
  ]);

  await admin.from('users').delete().eq('id', userId);
  if (user?.auth_user_id) await admin.auth.admin.deleteUser(user.auth_user_id as string);

  const cookieStore = await cookies();
  cookieStore.delete(IDENTITY_COOKIE);
  return NextResponse.json({ ok: true });
}
