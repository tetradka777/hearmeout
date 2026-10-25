import { NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/identity';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { fetchAllRows } from '@/lib/supabasePaginate';
import { DEFAULT_PRIVACY, fetchPrivacy } from '@/lib/privacy';
import type { ApiUser } from '@/lib/types';

// Home → "friends loved, you haven't heard": albums your friends scored 4.5
// or more that you've neither rated nor played. Most loved first (how many
// friends, then their average). Only friends whose ratings are visible to
// friends, never a "keep private" rating.
export type Recommendation = { albumId: string; avg: number; fans: ApiUser[] };

const LOVED = 4.5;
const MAX = 20;

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'not_registered' }, { status: 401 });
  const admin = supabaseAdmin();
  const { data: friendRows } = await admin.from('friendships').select('friend:friend_id(id, name, handle, avatar_url)').eq('user_id', userId);
  const friends = (friendRows || []).flatMap((r) => {
    const f = r.friend as unknown as { id: string; name: string; handle: string; avatar_url: string | null } | null;
    return f ? [{ id: f.id, name: f.name, handle: f.handle, avatarUrl: f.avatar_url }] : [];
  });
  if (!friends.length) return NextResponse.json([]);
  const ids = friends.map((f) => f.id);
  const [{ rows: loved }, { data: mine }, privacy] = await Promise.all([
    fetchAllRows<{ user_id: string; album_id: string; stars: number; is_private: boolean | null }>((f, t) => admin.from('ratings').select('user_id, album_id, stars, is_private').in('user_id', ids).gte('stars', LOVED).order('id').range(f, t), 20000, 4),
    admin.from('ratings').select('album_id').eq('user_id', userId),
    fetchPrivacy(admin, ids),
  ]);
  const rated = new Set((mine || []).map((r) => r.album_id as string));
  const byAlbum = new Map<string, { sum: number; fans: Set<string> }>();
  for (const r of loved || []) {
    if (r.is_private || rated.has(r.album_id) || !(privacy.get(r.user_id) ?? DEFAULT_PRIVACY).ratingsVisible) continue;
    const cur = byAlbum.get(r.album_id) || { sum: 0, fans: new Set<string>() };
    cur.sum += Number(r.stars);
    cur.fans.add(r.user_id);
    byAlbum.set(r.album_id, cur);
  }
  const ranked = [...byAlbum.entries()]
    .map(([albumId, v]) => ({ albumId, avg: v.sum / v.fans.size, fans: [...v.fans] }))
    .sort((a, b) => b.fans.length - a.fans.length || b.avg - a.avg)
    .slice(0, MAX * 3);
  if (!ranked.length) return NextResponse.json([]);
  // Played already (any of the candidates in your history) → not new to you.
  const { data: played } = await admin.from('listening_events').select('album_id').eq('user_id', userId).in('album_id', ranked.map((r) => r.albumId)).limit(5000);
  const heard = new Set((played || []).map((p) => p.album_id as string));
  const byId = new Map(friends.map((f) => [f.id, f] as const));
  const out: Recommendation[] = ranked
    .filter((r) => !heard.has(r.albumId))
    .slice(0, MAX)
    .map((r) => ({ albumId: r.albumId, avg: Math.round(r.avg * 10) / 10, fans: r.fans.slice(0, 3).map((id) => byId.get(id)!).filter(Boolean) }));
  return NextResponse.json(out);
}
