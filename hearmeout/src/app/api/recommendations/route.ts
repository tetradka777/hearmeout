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

// Answers per person for a few minutes (the card changes slowly, and the
// page drops albums you've rated since on its own).
const TTL_MS = 5 * 60 * 1000;
const memo = new Map<string, { at: number; body: Recommendation[] }>();

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'not_registered' }, { status: 401 });
  const hit = memo.get(userId);
  if (hit && Date.now() - hit.at < TTL_MS) return NextResponse.json(hit.body);
  const body = await build(userId);
  memo.set(userId, { at: Date.now(), body });
  if (memo.size > 2000) memo.delete(memo.keys().next().value!);
  return NextResponse.json(body);
}

async function build(userId: string): Promise<Recommendation[]> {
  const admin = supabaseAdmin();
  const [{ data: friendRows }, { data: mine }] = await Promise.all([
    admin.from('friendships').select('friend:friend_id(id, name, handle, avatar_url)').eq('user_id', userId),
    admin.from('ratings').select('album_id').eq('user_id', userId),
  ]);
  const friends = (friendRows || []).flatMap((r) => {
    const f = r.friend as unknown as { id: string; name: string; handle: string; avatar_url: string | null } | null;
    return f ? [{ id: f.id, name: f.name, handle: f.handle, avatarUrl: f.avatar_url }] : [];
  });
  if (!friends.length) return [];
  const ids = friends.map((f) => f.id);
  const [{ rows: loved }, privacy] = await Promise.all([
    fetchAllRows<{ user_id: string; album_id: string; stars: number; is_private: boolean | null }>((f, t) => admin.from('ratings').select('user_id, album_id, stars, is_private').in('user_id', ids).gte('stars', LOVED).order('id').range(f, t), 20000, 4),
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
  if (!ranked.length) return [];
  // Played already (any of the candidates in your history) → not new to you.
  const { data: played } = await admin.from('listening_events').select('album_id').eq('user_id', userId).in('album_id', ranked.map((r) => r.albumId)).limit(5000);
  const heard = new Set((played || []).map((p) => p.album_id as string));
  const byId = new Map(friends.map((f) => [f.id, f] as const));
  const out: Recommendation[] = ranked
    .filter((r) => !heard.has(r.albumId))
    .slice(0, MAX)
    .map((r) => ({ albumId: r.albumId, avg: Math.round(r.avg * 10) / 10, fans: r.fans.slice(0, 3).map((id) => byId.get(id)!).filter(Boolean) }));
  return out;
}
