import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/identity';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { concertsConfigured, cachedArtistConcerts, regionFirst, type Concert } from '@/lib/concerts';
import { ALBUMS } from '@/lib/data';

export type ConcertFeedItem = Concert & { artist: string; group: 'yours' | 'popular' };

const YOURS = 8;        // most-listened artists, last 6 months
const POPULAR = 10;     // most-streamed artists from the catalog's kworb ranking
const PER_ARTIST = 3;   // concerts shown per artist

// Discover → "Concerts": your most-listened artists first (by time played
// over the last six months), then the most popular artists (the catalog's
// all-time Spotify streaming rank). Within each artist, shows in the
// viewer's country come first, then the rest of the world by date —
// nothing is filtered out by region.
export async function GET(request: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'not_registered' }, { status: 401 });
  if (!concertsConfigured()) return NextResponse.json({ configured: false, items: [] });
  const country = (new URL(request.url).searchParams.get('country') || '').toUpperCase() || null;

  const since = new Date(Date.now() - 182 * 86400000).toISOString();
  const { data: plays } = await supabaseAdmin()
    .from('listening_events')
    .select('artist, duration_ms')
    .eq('user_id', userId)
    .gte('played_at', since)
    .limit(20000);
  const msByArtist = new Map<string, { name: string; ms: number }>();
  for (const p of plays || []) {
    const name = (p.artist as string | null)?.split(',')[0]?.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    const cur = msByArtist.get(key) || { name, ms: 0 };
    cur.ms += (p.duration_ms as number | null) || 0;
    msByArtist.set(key, cur);
  }
  const yours = [...msByArtist.values()].sort((a, b) => b.ms - a.ms).slice(0, YOURS).map((a) => a.name);
  const taken = new Set(yours.map((n) => n.toLowerCase()));

  const popular: string[] = [];
  for (const a of [...ALBUMS].filter((x) => x.popularRank != null).sort((x, y) => (x.popularRank ?? 0) - (y.popularRank ?? 0))) {
    const name = a.artist.split(',')[0].trim();
    if (taken.has(name.toLowerCase())) continue;
    taken.add(name.toLowerCase());
    popular.push(name);
    if (popular.length >= POPULAR) break;
  }

  // Sequential, so a cold cache stays under Ticketmaster's 5 requests/s.
  const items: ConcertFeedItem[] = [];
  const lists: [string, 'yours' | 'popular'][] = [...yours.map((n) => [n, 'yours'] as [string, 'yours']), ...popular.map((n) => [n, 'popular'] as [string, 'popular'])];
  for (const [artist, group] of lists) {
    try {
      const concerts = regionFirst(await cachedArtistConcerts(artist), country);
      for (const c of concerts.slice(0, PER_ARTIST)) items.push({ ...c, artist, group });
    } catch {
      // One artist failing (rate limit, odd name) shouldn't hide the rest.
    }
  }
  return NextResponse.json({ configured: true, items });
}
