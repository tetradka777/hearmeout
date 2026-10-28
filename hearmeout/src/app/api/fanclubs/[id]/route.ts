import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/identity';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { fetchAllRows } from '@/lib/supabasePaginate';
import { DEFAULT_PRIVACY, fetchPrivacy } from '@/lib/privacy';
import { fetchSpotifyArtistPhoto } from '@/lib/spotifyCatalog';
import { withSpotifyCache } from '@/lib/spotifyCache';
import type { ApiUser } from '@/lib/types';

const SPOTIFY_ID = /^[A-Za-z0-9]{22}$/;
const DAYS = 30;

export type FanClubTrack = { title: string; albumId: string | null; cover: string | null; plays: number; listeners: number };
// A member shown on the page: friends, and people with an open profile who
// appear in Discover; plays = this artist in the last 30 days (only when
// they share what they listen to, else null).
export type FanClubMember = ApiUser & { friend: boolean; joinedAt: string; plays: number | null };
export type FanClubPage = {
  artist: { id: string; name: string; photo: string | null };
  members: number;
  joined: boolean;
  friends: ApiUser[];
  tracks: FanClubTrack[];
  // Everyone who may be shown (friends first, then by plays), how many
  // others are in it privately, members who joined in the last 7 days, and
  // the members' plays of this artist in 30 days.
  shown: FanClubMember[];
  hidden: number;
  newThisWeek: number;
  plays: number;
};

// One fan club (an artist's followers, migration 020): how many people
// are in it, whether you are, which of your friends are (other members
// stay a number — a stranger's follows aren't shown), and what the members
// played of this artist in the last 30 days, as totals (only members who
// share what they listen to are counted).
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'not_registered' }, { status: 401 });
  const { id } = await params;
  if (!SPOTIFY_ID.test(id)) return NextResponse.json({ error: 'bad_id' }, { status: 400 });
  const nameParam = (new URL(request.url).searchParams.get('name') || '').slice(0, 200);
  const admin = supabaseAdmin();

  const [{ rows: follows }, { data: friendRows }, photo] = await Promise.all([
    fetchAllRows((f, t) => admin.from('artist_follows').select('user_id, artist_name, created_at').eq('artist_id', id).order('user_id').range(f, t), 50000, 4),
    admin.from('friendships').select('friend:friend_id(id, name, handle, avatar_url)').eq('user_id', userId),
    withSpotifyCache(`sp-aphoto:v1:${id}`, 90 * 86400, () => fetchSpotifyArtistPhoto(id)).catch(() => null),
  ]);
  const memberIds = new Set((follows || []).map((r) => r.user_id as string));
  const name = nameParam || ((follows || [])[0]?.artist_name as string | undefined) || '';
  const friends: ApiUser[] = [];
  for (const row of friendRows || []) {
    const f = row.friend as unknown as { id: string; name: string; handle: string; avatar_url: string | null } | null;
    if (f && memberIds.has(f.id)) friends.push({ id: f.id, name: f.name, handle: f.handle, avatarUrl: f.avatar_url });
  }

  // What members played of this artist lately (by track, newest window).
  const tracks: FanClubTrack[] = [];
  const playsBy = new Map<string, number>();
  let sharingSet = new Set<string>();
  if (memberIds.size) {
    const privacy = await fetchPrivacy(admin, [...memberIds]);
    const sharing = [...memberIds].filter((m) => (privacy.get(m) ?? DEFAULT_PRIVACY).shareLive);
    sharingSet = new Set(sharing);
    if (sharing.length) {
      const since = new Date(Date.now() - DAYS * 86400000).toISOString();
      const { rows: plays } = await fetchAllRows((f, t) => admin
        .from('listening_events')
        .select('user_id, track_title, album_id, cover_url')
        .eq('artist_id', id)
        .in('user_id', sharing.slice(0, 500))
        .gte('played_at', since)
        .order('id')
        .range(f, t), 20000, 4);
      const byTrack = new Map<string, FanClubTrack & { users: Set<string> }>();
      for (const p of plays || []) {
        const title = p.track_title as string | null;
        if (!title) continue;
        const key = title.toLowerCase();
        const cur = byTrack.get(key) || { title, albumId: (p.album_id as string | null) ?? null, cover: (p.cover_url as string | null) ?? null, plays: 0, listeners: 0, users: new Set<string>() };
        cur.plays++;
        cur.users.add(p.user_id as string);
        playsBy.set(p.user_id as string, (playsBy.get(p.user_id as string) ?? 0) + 1);
        if (!cur.cover && p.cover_url) cur.cover = p.cover_url as string;
        byTrack.set(key, cur);
      }
      for (const t of [...byTrack.values()].sort((a, b) => b.users.size - a.users.size || b.plays - a.plays).slice(0, 20)) {
        tracks.push({ title: t.title, albumId: t.albumId, cover: t.cover, plays: t.plays, listeners: t.users.size });
      }
    }
  }

  // Who can be shown: you, your friends, and open profiles that appear in
  // Discover; the rest stay a number.
  const friendIds = new Set(friends.map((f) => f.id));
  const joinedAt = new Map((follows || []).map((r) => [r.user_id as string, r.created_at as string]));
  const ids = [...memberIds].slice(0, 1000);
  const { data: people } = ids.length
    ? await admin.from('users').select('id, name, handle, avatar_url, discoverable, is_open_profile').in('id', ids)
    : { data: [] as Record<string, unknown>[] };
  const shown: FanClubMember[] = [];
  for (const u of people || []) {
    const uid = u.id as string;
    const friend = friendIds.has(uid);
    if (!(uid === userId || friend || (u.discoverable !== false && u.is_open_profile === true))) continue;
    shown.push({
      id: uid, name: u.name as string, handle: u.handle as string, avatarUrl: (u.avatar_url as string | null) ?? null,
      friend, joinedAt: joinedAt.get(uid) ?? '', plays: sharingSet.has(uid) ? playsBy.get(uid) ?? 0 : null,
    });
  }
  shown.sort((a, b) => Number(b.id === userId) - Number(a.id === userId) || Number(b.friend) - Number(a.friend) || (b.plays ?? -1) - (a.plays ?? -1) || a.name.localeCompare(b.name));
  const weekAgo = Date.now() - 7 * 86400000;
  const newThisWeek = [...joinedAt.values()].filter((at) => Date.parse(at) >= weekAgo).length;
  const plays = [...playsBy.values()].reduce((a, b) => a + b, 0);

  const page: FanClubPage = {
    artist: { id, name, photo }, members: memberIds.size, joined: memberIds.has(userId), friends, tracks,
    shown, hidden: memberIds.size - shown.length, newThisWeek, plays,
  };
  return NextResponse.json(page);
}
