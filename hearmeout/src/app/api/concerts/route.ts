import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/identity';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { fetchAllRows } from '@/lib/supabasePaginate';
import { concertsConfigured, cachedArtistConcerts, popularConcerts, regionFirst, type Concert } from '@/lib/concerts';

export type ConcertFeedItem = Concert & { artist: string; artistId: string | null; group: 'yours' | 'popular'; photo?: string | null };

const YOURS = 25;       // most-listened artists, last 6 months
const CLUBS = 40;       // artists whose fan clubs you joined, newest first
const POPULAR = 40;     // headliners of Ticketmaster's most relevant music events
const PER_ARTIST = 30;  // concerts per artist (all of them, near enough: the card lists every date)

// Discover → "Concerts": your most-listened artists first (by time played
// over the last six months) and the artists whose fan clubs you joined, then the most popular concerts — Ticketmaster's
// own most relevant music events in your country (worldwide when that gives
// few), grouped by headliner. Within each of your artists, shows in the
// viewer's country come first, then the rest of the world by date.
export async function GET(request: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'not_registered' }, { status: 401 });
  if (!concertsConfigured()) return NextResponse.json({ configured: false, items: [] });
  const country = (new URL(request.url).searchParams.get('country') || '').toUpperCase() || null;

  const since = new Date(Date.now() - 182 * 86400000).toISOString();
  const [{ rows: plays }, { data: follows }] = await Promise.all([
    fetchAllRows((f, t) => supabaseAdmin()
      .from('listening_events')
      .select('artist, artist_id, duration_ms')
      .eq('user_id', userId)
      .gte('played_at', since)
      .order('id')
      .range(f, t)),
    supabaseAdmin().from('artist_follows').select('artist_id, artist_name').eq('user_id', userId).order('created_at', { ascending: false }).limit(CLUBS),
  ]);
  const msByArtist = new Map<string, { name: string; ms: number; id: string | null }>();
  for (const p of plays || []) {
    const name = (p.artist as string | null)?.split(',')[0]?.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    const cur = msByArtist.get(key) || { name, ms: 0, id: null };
    // The Spotify id of the main artist, for telling same-named artists apart.
    if (!cur.id && p.artist_id && !(p.artist as string).includes(',')) cur.id = p.artist_id as string;
    cur.ms += (p.duration_ms as number | null) || 0;
    msByArtist.set(key, cur);
  }
  const yoursRanked = [...msByArtist.values()].sort((a, b) => b.ms - a.ms).slice(0, YOURS);
  const yours = yoursRanked.map((a) => a.name);
  const idOf = new Map(yoursRanked.map((a) => [a.name, a.id]));
  const taken = new Set(yours.map((n) => n.toLowerCase()));
  for (const f of follows || []) {
    const name = (f.artist_name as string | null)?.trim();
    if (!name || taken.has(name.toLowerCase())) continue;
    taken.add(name.toLowerCase());
    yours.push(name);
    idOf.set(name, (f.artist_id as string | null) ?? null);
  }

  // Sequential, so a cold cache stays under Ticketmaster's 5 requests/s.
  const items: ConcertFeedItem[] = [];
  for (const artist of yours) {
    try {
      const concerts = regionFirst(await cachedArtistConcerts(artist, idOf.get(artist) ?? null), country);
      for (const c of concerts.slice(0, PER_ARTIST)) items.push({ ...c, artist, artistId: idOf.get(artist) ?? null, group: 'yours' });
    } catch {
      // One artist failing (rate limit, odd name) shouldn't hide the rest.
    }
  }
  try {
    const local = await popularConcerts(country);
    const lists = local.length >= POPULAR || !country ? local : [...local, ...(await popularConcerts(null))];
    let n = 0;
    for (const { artist, photo, concerts } of lists) {
      if (n >= POPULAR || taken.has(artist.toLowerCase())) continue;
      taken.add(artist.toLowerCase());
      n++;
      for (const c of regionFirst(concerts, country).slice(0, PER_ARTIST)) items.push({ ...c, artist, artistId: null, group: 'popular', photo });
    }
  } catch {
    // Popular concerts are extra; your own artists still show.
  }
  return NextResponse.json({ configured: true, items });
}
