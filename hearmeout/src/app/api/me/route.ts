import { NextRequest, NextResponse } from 'next/server';
import { LANGUAGES, normalizeLanguage } from '@/lib/i18n';
import { cookies } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUserId, IDENTITY_COOKIE } from '@/lib/identity';
import { getUserProfile, fetchIsOpenProfile } from '@/lib/userProfile';
import { slugifyHandle } from '@/lib/slug';
import type { ApiUser, Me } from '@/lib/types';
import { isInternalEmail } from '@/lib/authInternalEmail';
import { isDesign, isMode, isPaletteId } from '@/lib/palettes';
import { DEFAULT_REGION, detectRegionFromSpotify, fetchRegionAuto } from '@/lib/regionDetect';
import { spotifyUserToken } from '@/lib/spotifySync';

const emailMemo = new Map<string, { at: number; email: string | null }>();

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'not_registered' }, { status: 401 });

  const admin = supabaseAdmin();
  // Everything at once: the play count, invite code and notification
  // switches used to be read one after another after this.
  const [profile, { data: prefs }, { data: conns }, { data: friendRows }, isOpenProfile, regionAuto, { count: playsCount }, { data: codeRow }, { data: notifyRow }, { data: pinnedRow }] = await Promise.all([
    getUserProfile(admin, userId, userId),
    admin.from('users').select('language, region, auth_user_id, banner_url, design, mode, palette, ticker_enabled, motion_enabled, time_format, week_start, ratings_visible, share_live, public_reviews, discoverable').eq('id', userId).maybeSingle(),
    admin.from('connections').select('provider').eq('user_id', userId),
    admin.from('friendships').select('friend:friend_id(id, name, handle, avatar_url)').eq('user_id', userId),
    fetchIsOpenProfile(admin, userId),
    fetchRegionAuto(admin, userId),
    // How many plays the account has (Home suggests importing the Spotify
    // history while it's small).
    admin.from('listening_events').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    admin.from('users').select('invite_code').eq('id', userId).maybeSingle(),
    // Release notification switches (migration 028), apart so a missing
    // column can't break the rest of the account.
    admin.from('users').select('notify_releases_mine, notify_releases_popular').eq('id', userId).maybeSingle(),
    // Pinned top 4 (migration 031), apart for the same reason.
    admin.from('users').select('pinned_albums, tz_offset').eq('id', userId).maybeSingle(),
  ]);

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
    // A call to Supabase Auth on every page load: kept for 10 minutes.
    const authId = prefs.auth_user_id as string;
    const hit = emailMemo.get(authId);
    if (hit && Date.now() - hit.at < 10 * 60 * 1000) email = hit.email;
    else {
      const { data: authUser } = await admin.auth.admin.getUserById(authId);
      const realEmail = authUser.user?.email ?? null;
      email = isInternalEmail(realEmail) ? null : realEmail;
      emailMemo.set(authId, { at: Date.now(), email });
    }
  }

  const me: Me = {
    ...profile,
    connections: { spotify: connSet.has('spotify'), appleMusic: connSet.has('apple_music') },
    playsCount: playsCount ?? 0,
    friends,
    language: normalizeLanguage(prefs?.language),
    region: prefs?.region ?? DEFAULT_REGION,
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
    notifyReleasesMine: (notifyRow as { notify_releases_mine?: boolean } | null)?.notify_releases_mine !== false,
    notifyReleasesPopular: (notifyRow as { notify_releases_popular?: boolean } | null)?.notify_releases_popular === true,
    pinnedAlbums: ((pinnedRow as { pinned_albums?: string[] | null } | null)?.pinned_albums ?? null) || null,
    tzOffset: (pinnedRow as { tz_offset?: number | null } | null)?.tz_offset ?? null,
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
  if (typeof body?.language === 'string' && (LANGUAGES as readonly string[]).includes(body.language)) patch.language = body.language;
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
    // Turned on and the country isn't known yet: ask Spotify now, once (no
    // connection yet → on the first sync after connecting).
    if (body.regionAuto && !detectedRegion) {
      const token = await spotifyUserToken(admin, userId).catch(() => null);
      if (token) await detectRegionFromSpotify(admin, userId, token);
    }
  }
  // Release notification switches (migration 028), their own update for
  // the same reason as regionAuto.
  const notifyPatch: Record<string, boolean> = {};
  if (typeof body?.notifyReleasesMine === 'boolean') notifyPatch.notify_releases_mine = body.notifyReleasesMine;
  if (typeof body?.notifyReleasesPopular === 'boolean') notifyPatch.notify_releases_popular = body.notifyReleasesPopular;
  if (Object.keys(notifyPatch).length) {
    const { error: notifyErr } = await admin.from('users').update(notifyPatch).eq('id', userId);
    if (notifyErr) return NextResponse.json({ error: notifyErr.message }, { status: 500 });
  }
  // The device's time zone (migration 031), for the streak reminder.
  if (Number.isInteger(body?.tzOffset) && Math.abs(body.tzOffset) <= 840) {
    await admin.from('users').update({ tz_offset: body.tzOffset }).eq('id', userId);
  }
  // Pinned top 4 (migration 031): up to four album ids, or null for the
  // automatic pick.
  if ('pinnedAlbums' in (body ?? {})) {
    const v = body.pinnedAlbums;
    const ids = Array.isArray(v) ? [...new Set(v.filter((x: unknown) => typeof x === 'string' && /^[\w:.-]{1,64}$/.test(x)) as string[])].slice(0, 4) : null;
    const { error: pinErr } = await admin.from('users').update({ pinned_albums: ids && ids.length ? ids : null }).eq('id', userId);
    if (pinErr) return NextResponse.json({ error: pinErr.message }, { status: 500 });
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
