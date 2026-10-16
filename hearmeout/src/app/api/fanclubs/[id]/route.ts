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
export type FanClubPage = {
  artist: { id: string; name: string; photo: string | null };
  members: number;
  joined: boolean;
  friends: ApiUser[];
  tracks: FanClubTrack[];
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
    fetchAllRows((f, t) => admin.from('artist_follows').select('user_id, artist_name').eq('artist_id', id).order('user_id').range(f, t), 50000, 4),
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
  if (memberIds.size) {
    const privacy = await fetchPrivacy(admin, [...memberIds]);
    const sharing = [...memberIds].filter((m) => (privacy.get(m) ?? DEFAULT_PRIVACY).shareLive);
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
        if (!cur.cover && p.cover_url) cur.cover = p.cover_url as string;
        byTrack.set(key, cur);
      }
      for (const t of [...byTrack.values()].sort((a, b) => b.users.size - a.users.size || b.plays - a.plays).slice(0, 20)) {
        tracks.push({ title: t.title, albumId: t.albumId, cover: t.cover, plays: t.plays, listeners: t.users.size });
      }
    }
  }

  const page: FanClubPage = { artist: { id, name, photo }, members: memberIds.size, joined: memberIds.has(userId), friends, tracks };
  return NextResponse.json(page);
}
