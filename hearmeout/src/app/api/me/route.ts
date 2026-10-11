import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUserId, IDENTITY_COOKIE } from '@/lib/identity';
import { getUserProfile, fetchIsOpenProfile } from '@/lib/userProfile';
import { slugifyHandle } from '@/lib/slug';
import type { ApiUser, Me } from '@/lib/types';
import { isInternalEmail } from '@/lib/authInternalEmail';
import { isDesign, isMode, isPaletteId } from '@/lib/palettes';
import { fetchRegionAuto } from '@/lib/regionDetect';

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'not_registered' }, { status: 401 });

  const admin = supabaseAdmin();
  const [profile, { data: prefs }, { data: conns }, { data: friendRows }, isOpenProfile, regionAuto] = await Promise.all([
    getUserProfile(admin, userId, userId),
    admin.from('users').select('language, region, auth_user_id, banner_url, design, mode, palette, ticker_enabled, motion_enabled, time_format, week_start, ratings_visible, share_live, public_reviews, discoverable').eq('id', userId).maybeSingle(),
    admin.from('connections').select('provider').eq('user_id', userId),
    admin.from('friendships').select('friend:friend_id(id, name, handle, avatar_url)').eq('user_id', userId),
    fetchIsOpenProfile(admin, userId),
    fetchRegionAuto(admin, userId),
  ]);
  const { data: codeRow } = await admin.from('users').select('invite_code').eq('id', userId).maybeSingle();

  if (!profile) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const connSet = new Set((conns || []).map((c) => c.provider as string));
  const friends: ApiUser[] = (friendRows || [])
    .map((row): ApiUser | null => {
      const f = row.friend as unknown as { id: string; name: string; handle: string; avatar_url: string | null } | null;
      return f ? { id: f.id, name: f.name, handle: f.handle, avatarUrl: f.avatar_url } : null;
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
    regionAuto: regionAuto.regionAuto,
    detectedRegion: regionAuto.detectedRegion,
    hasPassword: !!prefs?.auth_user_id,
    inviteCode: (codeRow as { invite_code?: string | null } | null)?.invite_code ?? null,
    email,
    bannerUrl: (prefs?.banner_url as string | null) ?? null,
    isOpenProfile,
    design: (prefs?.design as Me['design']) || 'cream-pop',
    mode: (prefs?.mode as Me['mode']) || 'light',
    palette: (prefs?.palette as Me['palette']) || 'lemons',
    tickerEnabled: prefs?.ticker_enabled !== false,
    motionEnabled: prefs?.motion_enabled !== false,
    timeFormat: (prefs?.time_format as Me['timeFormat']) || '24',
    weekStart: (prefs?.week_start as Me['weekStart']) || 'mon',
    ratingsVisible: prefs?.ratings_visible !== false,
    shareLive: prefs?.share_live !== false,
    publicReviews: prefs?.public_reviews !== false,
    discoverable: prefs?.discoverable !== false,
  };
  return NextResponse.json(me);
}

export async function PATCH(request: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'not_registered' }, { status: 401 });

  const admin = supabaseAdmin();
  const body = await request.json().catch(() => null);
  const patch: Record<string, string | boolean | null> = {};
  // The same limits as the UI, checked here too (a direct request skipped
  // them): name 2–24, handle 3–20, region a country code.
  if (typeof body?.name === 'string' && body.name.trim()) {
    const name = body.name.trim();
    if (name.length < 2 || name.length > 24) return NextResponse.json({ error: 'name_length' }, { status: 400 });
    patch.name = name;
  }
  if (typeof body?.handle === 'string' && body.handle.trim()) {
    const slug = slugifyHandle(body.handle.replace(/^@/, ''));
    if (slug.length < 3 || slug.length > 20) return NextResponse.json({ error: 'handle_length' }, { status: 400 });
    patch.handle = `@${slug}`;
  }
  // Pictures are stored inline and sent with every profile and friend
  // list, so only a small image made on the device (the client shrinks it)
  // or "" to remove it — never an outside URL, which would also let its
  // owner see the IP of everyone who views the profile.
  for (const [field, column, maxKb] of [['avatarUrl', 'avatar_url', 200], ['bannerUrl', 'banner_url', 700]] as const) {
    const v = body?.[field];
    if (typeof v !== 'string') continue;
    if (v && (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(v) || v.length > maxKb * 1024)) {
      return NextResponse.json({ error: 'invalid_image' }, { status: 400 });
    }
    patch[column] = v || null;
  }
  if (typeof body?.language === 'string' && ['ru', 'en', 'fr', 'es', 'de'].includes(body.language)) patch.language = body.language;
  if ('region' in (body ?? {})) patch.region = typeof body.region === 'string' && /^[A-Z]{2}$/.test(body.region) ? body.region : null;
  if (typeof body?.isOpenProfile === 'boolean') patch.is_open_profile = body.isOpenProfile;
  if (typeof body?.design === 'string' && isDesign(body.design)) patch.design = body.design;
  if (typeof body?.mode === 'string' && isMode(body.mode)) patch.mode = body.mode;
  if (typeof body?.palette === 'string' && isPaletteId(body.palette)) patch.palette = body.palette;
  if (typeof body?.tickerEnabled === 'boolean') patch.ticker_enabled = body.tickerEnabled;
  if (typeof body?.motionEnabled === 'boolean') patch.motion_enabled = body.motionEnabled;
  if (typeof body?.timeFormat === 'string' && (body.timeFormat === '24' || body.timeFormat === '12')) patch.time_format = body.timeFormat;
  if (typeof body?.weekStart === 'string' && (body.weekStart === 'mon' || body.weekStart === 'sun')) patch.week_start = body.weekStart;
  if (typeof body?.ratingsVisible === 'boolean') patch.ratings_visible = body.ratingsVisible;
  if (typeof body?.shareLive === 'boolean') patch.share_live = body.shareLive;
  if (typeof body?.publicReviews === 'boolean') patch.public_reviews = body.publicReviews;
  if (typeof body?.discoverable === 'boolean') patch.discoverable = body.discoverable;
  // "Detect from my streaming account" (migration 023) — its own update so
  // a missing column (migration not applied yet) can't fail the rest.
  if (typeof body?.regionAuto === 'boolean') {
    const { detectedRegion } = await fetchRegionAuto(admin, userId);
    const autoPatch: Record<string, string | boolean> = { region_auto: body.regionAuto };
    if (body.regionAuto && detectedRegion) autoPatch.region = detectedRegion;
    const { error: autoErr } = await admin.from('users').update(autoPatch).eq('id', userId);
    if (autoErr) return NextResponse.json({ error: autoErr.message }, { status: 500 });
  }
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
