import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/identity';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { fetchAllRows } from '@/lib/supabasePaginate';
import { deezerGet } from '@/lib/deezerServer';
import { withSpotifyCache } from '@/lib/spotifyCache';

// id: the Spotify artist id when known (follows and your own plays have
// one); chart artists only have a name and photo until someone joins.
export type FanClub = { id: string | null; name: string; photo: string | null; members: number };

const PAGE = 24;

// Who you played lately, per person for ten minutes: every page of
// suggestions used to read up to 20 000 plays again.
const PLAYED_TTL_MS = 10 * 60 * 1000;
const playedMemo = new Map<string, { at: number; list: { id: string; name: string; n: number }[] }>();
// Deezer's chart ids: all, then pop, rap, rock, electronic, R&B, latin,
// alternative, dance, metal, soul, reggae, jazz, country, classical.
const DEEZER_CHARTS = [0, 132, 116, 152, 106, 165, 197, 85, 113, 464, 169, 144, 129, 84, 98];

type DzArtist = { id: number; name: string; picture_medium?: string };

// Popular artists from Deezer's charts (100 per chart), a day at a time.
function chartArtists(): Promise<{ name: string; photo: string | null }[]> {
  return withSpotifyCache('fanclub-charts:v1', 86400, async () => {
    const seen = new Set<string>();
    const out: { name: string; photo: string | null }[] = [];
    for (const g of DEEZER_CHARTS) {
      const d = await deezerGet<{ data?: DzArtist[] }>(`/chart/${g}/artists?limit=100`).catch(() => ({ data: [] as DzArtist[] }));
      for (const a of d.data || []) {
        const k = a.name.toLowerCase();
        if (seen.has(k)) continue;
        seen.add(k);
        out.push({ name: a.name, photo: a.picture_medium ?? null });
      }
    }
    return out;
  });
}

// Fan clubs are artist follows (migration 020). GET returns yours; with
// ?suggest=<offset> a page of fan clubs to join instead: artists you play
// most (90 days) that you don't follow, then the most popular artists on
// Deezer's charts — about a thousand in all. Each with how many people on
// the site follow them.
export async function GET(request: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'not_registered' }, { status: 401 });
  const admin = supabaseAdmin();
  const params = new URL(request.url).searchParams;

  const { data: follows, error } = await admin.from('artist_follows').select('artist_id, artist_name, created_at').eq('user_id', userId).order('created_at', { ascending: false });
  if (error) return NextResponse.json({ mine: [], suggested: [], next: null });
  const followedIds = new Set((follows || []).map((f) => f.artist_id as string));
  const followedNames = new Set((follows || []).map((f) => (f.artist_name as string).toLowerCase()));

  const memberCounts = async (names: string[]) => {
    const counts = new Map<string, number>();
    if (!names.length) return counts;
    const { rows } = await fetchAllRows((f, t) => admin.from('artist_follows').select('artist_name').in('artist_name', names).order('artist_name').range(f, t), 50000, 4);
    for (const r of rows || []) {
      const k = (r.artist_name as string).toLowerCase();
      counts.set(k, (counts.get(k) || 0) + 1);
    }
    return counts;
  };

  if (!params.has('suggest')) {
    const counts = await memberCounts((follows || []).map((f) => f.artist_name as string));
    const mine: FanClub[] = (follows || []).map((f) => ({ id: f.artist_id as string, name: f.artist_name as string, photo: null, members: counts.get((f.artist_name as string).toLowerCase()) || 1 }));
    return NextResponse.json({ mine });
  }

  const offset = Math.max(0, Number(params.get('suggest')) || 0);
  let played = playedMemo.get(userId);
  if (!played || Date.now() - played.at > PLAYED_TTL_MS) {
    const since = new Date(Date.now() - 90 * 86400000).toISOString();
    const { rows: plays } = await fetchAllRows((f, t) => admin
      .from('listening_events')
      .select('artist, artist_id')
      .eq('user_id', userId)
      .gte('played_at', since)
      .not('artist_id', 'is', null)
      .order('id')
      .range(f, t), 20000, 4);
    const listened = new Map<string, { id: string; name: string; n: number }>();
    for (const p of plays || []) {
      const name = p.artist as string | null;
      const id = p.artist_id as string;
      if (!name || name.includes(',')) continue;
      const cur = listened.get(id) || { id, name, n: 0 };
      cur.n++;
      listened.set(id, cur);
    }
    played = { at: Date.now(), list: [...listened.values()].sort((a, b) => b.n - a.n) };
    playedMemo.set(userId, played);
    if (playedMemo.size > 2000) playedMemo.delete(playedMemo.keys().next().value!);
  }
  // Clubs you've joined since are left out here, not in the stored list.
  const all: { id: string | null; name: string; photo: string | null }[] = played.list.filter((a) => !followedIds.has(a.id)).map((a) => ({ id: a.id, name: a.name, photo: null }));
  const taken = new Set([...all.map((a) => a.name.toLowerCase()), ...followedNames]);
  for (const a of await chartArtists().catch(() => [])) {
    if (taken.has(a.name.toLowerCase())) continue;
    taken.add(a.name.toLowerCase());
    all.push({ id: null, name: a.name, photo: a.photo });
  }
  const page = all.slice(offset, offset + PAGE);
  const counts = await memberCounts(page.map((a) => a.name));
  const suggested: FanClub[] = page.map((a) => ({ ...a, members: counts.get(a.name.toLowerCase()) || 0 }));
  return NextResponse.json({ suggested, next: offset + PAGE < all.length ? offset + PAGE : null });
}
