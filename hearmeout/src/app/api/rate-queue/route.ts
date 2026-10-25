import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/identity';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { fetchAllRows } from '@/lib/supabasePaginate';
import { ALBUMS } from '@/lib/data';

// The rating queue: your most played albums (by time listened, from your
// listening history — imported or synced) that you haven't rated yet, so
// you can score them one after another. Up to 60; kept 5 minutes per
// person in this process (the page drops the ones you rate meanwhile).
export type QueueAlbum = { albumId: string; plays: number; minutes: number };

const MAX = 60;
const TTL_MS = 5 * 60 * 1000;
const memo = new Map<string, { at: number; items: QueueAlbum[] }>();
// Catalog albums are rated under their own id but played under Spotify's.
const SPOTIFY_OF = new Map(ALBUMS.filter((a) => a.spotifyId).map((a) => [a.id, a.spotifyId as string]));

// ?fresh=1 skips the 5-minute copy (right after an import).
export async function GET(request: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'not_registered' }, { status: 401 });
  const hit = memo.get(userId);
  const fresh = new URL(request.url).searchParams.has('fresh');
  if (hit && !fresh && Date.now() - hit.at < TTL_MS) return NextResponse.json(hit.items);

  const admin = supabaseAdmin();
  const [{ rows }, { data: rated }] = await Promise.all([
    // The most recent 60 000 plays are plenty to find the albums that matter.
    fetchAllRows<{ album_id: string | null; duration_ms: number | null }>((f, t) => admin.from('listening_events').select('album_id, duration_ms').eq('user_id', userId).not('album_id', 'is', null).order('id', { ascending: false }).range(f, t), 60000, 6),
    admin.from('ratings').select('album_id').eq('user_id', userId),
  ]);
  const done = new Set<string>();
  for (const r of rated || []) {
    const id = r.album_id as string;
    done.add(id);
    const sp = SPOTIFY_OF.get(id);
    if (sp) done.add(sp);
  }
  const byAlbum = new Map<string, { plays: number; ms: number }>();
  for (const r of rows) {
    const id = r.album_id as string;
    if (done.has(id)) continue;
    const cur = byAlbum.get(id) || { plays: 0, ms: 0 };
    cur.plays += 1;
    cur.ms += r.duration_ms || 0;
    byAlbum.set(id, cur);
  }
  const items: QueueAlbum[] = [...byAlbum.entries()]
    // An album played once in passing isn't worth a score yet.
    .filter(([, v]) => v.plays >= 3)
    .sort((a, b) => b[1].ms - a[1].ms)
    .slice(0, MAX)
    .map(([albumId, v]) => ({ albumId, plays: v.plays, minutes: Math.round(v.ms / 60000) }));
  memo.set(userId, { at: Date.now(), items });
  if (memo.size > 2000) memo.delete(memo.keys().next().value as string);
  return NextResponse.json(items);
}
