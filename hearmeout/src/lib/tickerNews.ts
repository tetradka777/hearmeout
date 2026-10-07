import type { SupabaseClient } from '@supabase/supabase-js';
import { ALBUMS } from './data';
import { withSpotifyCache } from './spotifyCache';
import { fetchAllRows } from './supabasePaginate';
import { fetchArtistAlbumsSplit, resolveSpotifyArtistId } from './spotifyCatalog';
import { RateLimitError } from './upstreamError';
import { cachedArtistConcerts, concertsConfigured, regionFirst } from './concerts';
import { DEFAULT_PRIVACY, fetchPrivacy } from './privacy';

// News for the activity strip, after the viewer's and friends' own activity:
// new and announced albums, upcoming concerts and records. "mine" marks items
// about artists the viewer listens to most; the rest are about the most
// popular artists (the catalog's all-time Spotify streaming rank, kworb).
export type TickerNewsItem =
  | { kind: 'release'; id: string; artist: string; title: string; date: string; mine: boolean; spotifyAlbumId: string }
  | { kind: 'upcoming'; id: string; artist: string; title: string; date: string; mine: boolean; spotifyAlbumId: string }
  | { kind: 'concert'; id: string; artist: string; date: string; city: string | null; country: string | null; mine: boolean }
  | { kind: 'dayRecord'; id: string; minutes: number }
  | { kind: 'milestone'; id: string; userId: string; name: string | null; count: number }
  | { kind: 'albumOfWeek'; id: string; albumId: string; count: number };

const RELEASE_DAYS = 21;    // "out now" window
const UPCOMING_DAYS = 120;  // announced albums this far ahead
const CONCERT_DAYS = 180;
const MILESTONES = [10, 25, 50, 100, 250, 500, 1000, 2500];

const dayMs = 86400000;
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

// The most streamed catalog artists, in rank order.
export function popularArtists(n: number, skip: Set<string> = new Set()): string[] {
  const out: string[] = [];
  const seen = new Set(skip);
  for (const a of [...ALBUMS].filter((x) => x.popularRank != null).sort((x, y) => (x.popularRank ?? 0) - (y.popularRank ?? 0))) {
    const name = a.artist.split(',')[0].trim();
    if (seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    out.push(name);
    if (out.length >= n) break;
  }
  return out;
}

// The viewer's most listened artists by time played over the last 90 days.
export async function topArtistsOf(admin: SupabaseClient, userId: string, n: number): Promise<string[]> {
  const { rows: data } = await fetchAllRows((f, t) => admin
    .from('listening_events')
    .select('artist, duration_ms')
    .eq('user_id', userId)
    .gte('played_at', new Date(Date.now() - 90 * dayMs).toISOString())
    .order('id')
    .range(f, t));
  const ms = new Map<string, { name: string; ms: number }>();
  for (const p of data || []) {
    const name = (p.artist as string | null)?.split(',')[0]?.trim();
    if (!name) continue;
    const cur = ms.get(name.toLowerCase()) || { name, ms: 0 };
    cur.ms += (p.duration_ms as number | null) || 0;
    ms.set(name.toLowerCase(), cur);
  }
  return [...ms.values()].sort((a, b) => b.ms - a.ms).slice(0, n).map((a) => a.name);
}

// Recent and announced albums of these artists. Artist ids and album lists
// go through the shared cache, so a warm cache costs Spotify nothing; a rate
// limit stops the loop and keeps what was found so far.
export async function releasesFor(artists: string[], mine: boolean): Promise<TickerNewsItem[]> {
  const items: TickerNewsItem[] = [];
  const now = Date.now();
  const recentFrom = isoDay(now - RELEASE_DAYS * dayMs);
  const today = isoDay(now);
  const upcomingTo = isoDay(now + UPCOMING_DAYS * dayMs);
  for (const artist of artists) {
    try {
      const id = await withSpotifyCache(`artistid:v1:${artist.toLowerCase()}`, 30 * 86400, () => resolveSpotifyArtistId(artist));
      if (!id) continue;
      const { released, upcoming } = await withSpotifyCache(`artistalbums:v1:${id}`, 12 * 3600, () => fetchArtistAlbumsSplit(id));
      const fresh = released.find((a) => a.releaseDate && a.releaseDate.length === 10 && a.releaseDate >= recentFrom && a.releaseDate <= today);
      if (fresh) items.push({ kind: 'release', id: `rel-${fresh.id}`, artist, title: fresh.title, date: fresh.releaseDate!, mine, spotifyAlbumId: fresh.id });
      const next = upcoming.find((a) => a.releaseDate && a.releaseDate <= upcomingTo);
      if (next) items.push({ kind: 'upcoming', id: `up-${next.id}`, artist, title: next.title, date: next.releaseDate!, mine, spotifyAlbumId: next.id });
    } catch (err) {
      if (err instanceof RateLimitError) break;
    }
  }
  return items;
}

// Each artist's next concert, in the viewer's country first.
export async function concertsFor(artists: string[], mine: boolean, country: string | null): Promise<TickerNewsItem[]> {
  if (!concertsConfigured()) return [];
  const items: TickerNewsItem[] = [];
  const until = isoDay(Date.now() + CONCERT_DAYS * dayMs);
  const today = isoDay(Date.now());
  for (const artist of artists) {
    try {
      const list = regionFirst((await cachedArtistConcerts(artist)).filter((c) => c.date >= today && c.date <= until), country);
      const c = list[0];
      if (c) items.push({ kind: 'concert', id: `con-${c.id}`, artist, date: c.date, city: c.city, country: c.country, mine });
    } catch {
      // One artist failing shouldn't hide the rest.
    }
  }
  return items;
}

// Records: the viewer's biggest listening day (today or yesterday beating
// every other day of the last 90), rating milestones the viewer or a friend
// reached this week, and the most rated album on HearMeOut this week.
export async function recordsFor(admin: SupabaseClient, userId: string, friendIds: string[], names: Map<string, string>): Promise<TickerNewsItem[]> {
  const items: TickerNewsItem[] = [];
  const now = Date.now();
  const weekAgo = new Date(now - 7 * dayMs).toISOString();

  const { rows: plays } = await fetchAllRows((f, t) => admin
    .from('listening_events')
    .select('duration_ms, played_at')
    .eq('user_id', userId)
    .gte('played_at', new Date(now - 90 * dayMs).toISOString())
    .order('id')
    .range(f, t));
  const byDay = new Map<string, number>();
  for (const p of plays || []) {
    const d = (p.played_at as string).slice(0, 10);
    byDay.set(d, (byDay.get(d) || 0) + ((p.duration_ms as number | null) || 0));
  }
  const recent = [isoDay(now), isoDay(now - dayMs)];
  const best = Math.max(0, ...[...byDay.entries()].filter(([d]) => !recent.includes(d)).map(([, ms]) => ms));
  for (const d of recent) {
    const ms = byDay.get(d) || 0;
    // Needs some history to beat, and at least an hour, to mean anything.
    if (byDay.size >= 7 && ms > best && ms >= 3600000) {
      items.push({ kind: 'dayRecord', id: `day-${d}`, minutes: Math.round(ms / 60000) });
      break;
    }
  }

  // Milestones: count ratings before and after the week started; a friend's
  // only counts when their ratings are visible to friends.
  const privacy = await fetchPrivacy(admin, friendIds);
  const people = [userId, ...friendIds.filter((id) => (privacy.get(id) ?? DEFAULT_PRIVACY).ratingsVisible)];
  const { rows: weekRatings } = await fetchAllRows((f, t) => admin.from('ratings').select('user_id').in('user_id', people).gte('created_at', weekAgo).order('id').range(f, t));
  const newThisWeek = new Map<string, number>();
  for (const r of weekRatings || []) newThisWeek.set(r.user_id as string, (newThisWeek.get(r.user_id as string) || 0) + 1);
  for (const [id, added] of newThisWeek) {
    const { count } = await admin.from('ratings').select('user_id', { count: 'exact', head: true }).eq('user_id', id);
    const total = count || 0;
    const reached = MILESTONES.filter((m) => total >= m && total - added < m).pop();
    if (reached) items.push({ kind: 'milestone', id: `ms-${id}-${reached}`, userId: id, name: id === userId ? null : names.get(id) ?? null, count: reached });
  }

  // Album of the week: public ratings only, at least three of them.
  const { rows: all } = await fetchAllRows((f, t) => admin.from('ratings').select('album_id').not('is_private', 'is', true).gte('created_at', weekAgo).order('id').range(f, t));
  const perAlbum = new Map<string, number>();
  for (const r of all || []) perAlbum.set(r.album_id as string, (perAlbum.get(r.album_id as string) || 0) + 1);
  const top = [...perAlbum.entries()].sort((a, b) => b[1] - a[1])[0];
  if (top && top[1] >= 3) items.push({ kind: 'albumOfWeek', id: `aow-${top[0]}`, albumId: top[0], count: top[1] });

  return items;
}
