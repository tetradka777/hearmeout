import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/identity';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { withSpotifyCache } from '@/lib/spotifyCache';
import { concertsFor, popularArtists, recordsFor, releasesFor, topArtistsOf, type TickerNewsItem } from '@/lib/tickerNews';

export type TickerNewsResponse = { items: TickerNewsItem[] };

const MY_ARTISTS = 6;
const POPULAR_ARTISTS = 12;
const POPULAR_CONCERTS = 6;

// The activity strip's news (see lib/tickerNews.ts). The popular-artist part
// is the same for everyone in a country, so it's cached once per country for
// six hours; the viewer's own part (their artists, their records) for an hour.
export async function GET(request: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'not_registered' }, { status: 401 });
  const raw = (new URL(request.url).searchParams.get('country') || '').toUpperCase();
  const country = /^[A-Z]{2}$/.test(raw) ? raw : null;
  const admin = supabaseAdmin();

  try {
    const mine = await withSpotifyCache(`ticker:me:v1:${userId}:${country ?? '-'}`, 3600, async () => {
      const { data: friendRows } = await admin.from('friendships').select('friend_id').eq('user_id', userId);
      const friendIds = (friendRows || []).map((r) => r.friend_id as string);
      const { data: friendUsers } = friendIds.length
        ? await admin.from('users').select('id, name').in('id', friendIds)
        : { data: [] as { id: string; name: string }[] };
      const names = new Map((friendUsers || []).map((u) => [u.id as string, u.name as string]));
      const artists = await topArtistsOf(admin, userId, MY_ARTISTS);
      return {
        artists,
        items: [
          ...(await recordsFor(admin, userId, friendIds, names)),
          ...(await releasesFor(artists, true)),
          ...(await concertsFor(artists, true, country)),
        ],
      };
    });

    const skip = new Set(mine.artists.map((a) => a.toLowerCase()));
    const global = await withSpotifyCache(`ticker:global:v1:${country ?? '-'}`, 6 * 3600, async () => {
      const artists = popularArtists(POPULAR_ARTISTS);
      return [...(await releasesFor(artists, false)), ...(await concertsFor(artists.slice(0, POPULAR_CONCERTS), false, country))];
    });

    // The viewer's artists come first; a popular artist the viewer also
    // listens to is already in their part.
    const seen = new Set<string>();
    const items: TickerNewsItem[] = [];
    for (const it of [...mine.items, ...global.filter((g) => !('artist' in g) || !skip.has(g.artist.toLowerCase()))]) {
      if (seen.has(it.id)) continue;
      seen.add(it.id);
      items.push(it);
    }
    const body: TickerNewsResponse = { items };
    return NextResponse.json(body);
  } catch (err) {
    console.error('ticker news:', err);
    return NextResponse.json({ items: [] } satisfies TickerNewsResponse);
  }
}
