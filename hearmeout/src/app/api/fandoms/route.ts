import { NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/identity';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { fetchAllRows } from '@/lib/supabasePaginate';

export type Fandom = { id: string; name: string; members: number };

const SUGGEST = 10;

// Fandoms (after Superfan) are artist follows (migration 020): the artists
// you follow, and the ones you listen to most (90 days) that you don't
// follow yet, each with how many people on the site follow them.
export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'not_registered' }, { status: 401 });
  const admin = supabaseAdmin();

  const { data: follows, error } = await admin.from('artist_follows').select('artist_id, artist_name, created_at').eq('user_id', userId).order('created_at', { ascending: false });
  if (error) return NextResponse.json({ mine: [], suggested: [] });
  const followed = new Set((follows || []).map((f) => f.artist_id as string));

  const since = new Date(Date.now() - 90 * 86400000).toISOString();
  const { rows: plays } = await fetchAllRows((f, t) => admin
    .from('listening_events')
    .select('artist, artist_id')
    .eq('user_id', userId)
    .gte('played_at', since)
    .not('artist_id', 'is', null)
    .order('id')
    .range(f, t), 20000, 4);
  const counts = new Map<string, { name: string; n: number }>();
  for (const p of plays || []) {
    const id = p.artist_id as string;
    const name = (p.artist as string | null)?.split(',')[0]?.trim();
    if (!id || !name || followed.has(id) || (p.artist as string).includes(',')) continue;
    const cur = counts.get(id) || { name, n: 0 };
    cur.n++;
    counts.set(id, cur);
  }
  const suggestedIds = [...counts.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, SUGGEST);

  const ids = [...followed, ...suggestedIds.map(([id]) => id)];
  const members = new Map<string, number>();
  if (ids.length) {
    const { rows } = await fetchAllRows((f, t) => admin.from('artist_follows').select('artist_id').in('artist_id', ids).order('artist_id').range(f, t), 50000, 4);
    for (const r of rows || []) members.set(r.artist_id as string, (members.get(r.artist_id as string) || 0) + 1);
  }
  const mine: Fandom[] = (follows || []).map((f) => ({ id: f.artist_id as string, name: f.artist_name as string, members: members.get(f.artist_id as string) || 1 }));
  const suggested: Fandom[] = suggestedIds.map(([id, v]) => ({ id, name: v.name, members: members.get(id) || 0 }));
  return NextResponse.json({ mine, suggested });
}
