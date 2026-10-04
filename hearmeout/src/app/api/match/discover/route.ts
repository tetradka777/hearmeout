import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUserId } from '@/lib/identity';

// Real rating-overlap similarity, not genre split — genre data is missing
// or thin for a lot of accounts (CSV-imported history in particular never
// carries a genre), while every account that's rated anything has real
// ratings to compare, so this is the more honestly-computable metric for
// people you haven't friended yet.
const MIN_SHARED_ALBUMS = 2;

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'not_registered' }, { status: 401 });

  const admin = supabaseAdmin();
  const [{ data: mine }, { data: others }, { data: friendRows }] = await Promise.all([
    admin.from('ratings').select('album_id, stars').eq('user_id', userId),
    // Other people's private ratings never feed someone else's match.
    admin.from('ratings').select('user_id, album_id, stars').neq('user_id', userId).not('is_private', 'is', true),
    admin.from('friendships').select('friend_id').eq('user_id', userId),
  ]);

  const myRatings = new Map((mine || []).map((r) => [r.album_id as string, Number(r.stars)]));
  if (!myRatings.size) return NextResponse.json({ people: [] });

  const excludeIds = new Set([userId, ...(friendRows || []).map((f) => f.friend_id as string)]);
  const byUser = new Map<string, { album_id: string; stars: number }[]>();
  for (const r of others || []) {
    const uid = r.user_id as string;
    if (excludeIds.has(uid)) continue;
    if (!byUser.has(uid)) byUser.set(uid, []);
    byUser.get(uid)!.push({ album_id: r.album_id as string, stars: Number(r.stars) });
  }

  const scored: { userId: string; score: number; shared: number }[] = [];
  for (const [uid, rows] of byUser) {
    const shared = rows.filter((r) => myRatings.has(r.album_id));
    if (shared.length < MIN_SHARED_ALBUMS) continue;
    const avgDiff = shared.reduce((s, r) => s + Math.abs(r.stars - myRatings.get(r.album_id)!), 0) / shared.length;
    const score = Math.round(Math.max(0, 100 - avgDiff * 20)); // 0 diff -> 100%, 5-star diff -> 0%
    scored.push({ userId: uid, score, shared: shared.length });
  }
  scored.sort((a, b) => b.score - a.score || b.shared - a.shared);
  const top = scored.slice(0, 30);
  if (!top.length) return NextResponse.json({ people: [] });

  // "Appear in Discover" off (Settings → Privacy) keeps a person out of these suggestions.
  const { data: users } = await admin.from('users').select('id, name, handle, avatar_url').in('id', top.map((t) => t.userId)).not('discoverable', 'is', false);
  const byId = new Map((users || []).map((u) => [u.id as string, u]));
  const people = top
    .map((t) => {
      const u = byId.get(t.userId);
      if (!u) return null;
      return { id: u.id, name: u.name, handle: u.handle, avatarUrl: u.avatar_url, score: t.score, sharedAlbums: t.shared };
    })
    .filter((p): p is NonNullable<typeof p> => !!p)
    .slice(0, 10);

  return NextResponse.json({ people });
}
