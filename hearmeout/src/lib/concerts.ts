import { withSpotifyCache } from './spotifyCache';
import { RateLimitError } from './upstreamError';

// Artist concerts for the artist page's Concerts tab (spec 6.7), from the
// Ticketmaster Discovery API. Needs TICKETMASTER_API_KEY (free key from
// developer.ticketmaster.com); without it the tab keeps its "find tickets"
// fallback. The artist is matched as a Ticketmaster *attraction* by exact
// name first, so a keyword search doesn't pull in tribute acts.

export type Concert = { id: string; date: string; time: string | null; name: string; venue: string | null; city: string | null; country: string | null; url: string | null };

const BASE = 'https://app.ticketmaster.com/discovery/v2';

export function concertsConfigured(): boolean {
  return !!process.env.TICKETMASTER_API_KEY;
}

// Over quota (429), every call fails fast until the quota resets — the
// Rate-Limit-Reset header when Ticketmaster sends it, else a minute — so a
// loop over artists stops instead of spending more requests.
let blockedUntil = 0;

async function tm(path: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  if (Date.now() < blockedUntil) throw new RateLimitError(Math.ceil((blockedUntil - Date.now()) / 1000));
  const url = new URL(`${BASE}${path}`);
  url.searchParams.set('apikey', process.env.TICKETMASTER_API_KEY || '');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url);
  if (res.status === 429) {
    const reset = Date.parse(res.headers.get('rate-limit-reset') || '');
    blockedUntil = Number.isFinite(reset) && reset > Date.now() ? reset : Date.now() + 60000;
    throw new RateLimitError(Math.ceil((blockedUntil - Date.now()) / 1000));
  }
  if (!res.ok) throw new Error(`Ticketmaster request failed (${path}): ${res.status}`);
  return res.json();
}

type TmAttraction = { id: string; name: string; externalLinks?: { spotify?: { url?: string }[] }; images?: { url: string; ratio?: string; width?: number }[] };
type TmEvent = {
  id: string;
  name: string;
  url?: string;
  dates?: { start?: { localDate?: string; localTime?: string } };
  _embedded?: { venues?: { name?: string; city?: { name?: string }; country?: { countryCode?: string } }[]; attractions?: TmAttraction[] };
};

// Upcoming events for the artist worldwide, sorted by date. The viewer's
// region only changes the order (regionFirst), never what's included.
// The artist's Ticketmaster attraction id barely ever changes, so it's cached
// for 30 days on its own: refreshing an artist's concerts then costs one
// request instead of two (Ticketmaster allows 5000 a day per key).
//
// Same name isn't always the same artist ("miley" isn't Miley Cyrus): when
// the Spotify artist is known, an attraction linked to a different Spotify
// artist is skipped and one linked to this one wins.
const spotifyIdOf = (a: TmAttraction) => a.externalLinks?.spotify?.[0]?.url?.match(/artist\/([A-Za-z0-9]{22})/)?.[1] ?? null;
function attractionId(artistName: string, spotifyArtistId?: string | null): Promise<string | null> {
  return withSpotifyCache(`tm-attraction:v2:${artistName.toLowerCase()}:${spotifyArtistId ?? ''}`, 30 * 86400, async () => {
    const attractions = await tm('/attractions.json', { keyword: artistName, classificationName: 'music', size: '10' });
    const list = ((attractions._embedded as { attractions?: TmAttraction[] } | undefined)?.attractions) || [];
    const same = list.filter((a) => a.name.toLowerCase() === artistName.toLowerCase());
    if (!spotifyArtistId) return same[0]?.id ?? null;
    return (same.find((a) => spotifyIdOf(a) === spotifyArtistId) || same.find((a) => !spotifyIdOf(a)))?.id ?? null;
  });
}

// An event belongs to the artist when they headline it, and no act on the
// bill has a longer name starting with theirs (a "Miley Cyrus" show tagged
// with an attraction called "Miley").
function isArtistsEvent(e: TmEvent, id: string, artistName: string): boolean {
  const acts = e._embedded?.attractions;
  if (!acts?.length) return true;
  if (acts[0].id !== id) return false;
  const prefix = `${artistName.toLowerCase()} `;
  return !acts.some((a) => a.id !== id && a.name.toLowerCase().startsWith(prefix));
}

export async function fetchArtistConcerts(artistName: string, spotifyArtistId?: string | null): Promise<Concert[]> {
  const id = await attractionId(artistName, spotifyArtistId);
  if (!id) return [];

  // Music events only (an attraction can also have sports or add-on events),
  // and no parking / upgrade / shuttle listings sold as separate events.
  const params: Record<string, string> = { attractionId: id, classificationName: 'music', sort: 'date,asc', size: '50' };
  const events = await tm('/events.json', params);
  const items = ((events._embedded as { events?: TmEvent[] } | undefined)?.events) || [];
  return items
    .filter((e) => e.dates?.start?.localDate && !/parking|shuttle|upgrade|voucher|add-on|hotel package/i.test(e.name) && isArtistsEvent(e, id, artistName))
    .map((e) => {
      const v = e._embedded?.venues?.[0];
      return {
        id: e.id,
        date: e.dates!.start!.localDate!,
        time: e.dates?.start?.localTime ?? null,
        name: e.name,
        venue: v?.name ?? null,
        city: v?.city?.name ?? null,
        country: v?.country?.countryCode ?? null,
        url: e.url ?? null,
      };
    });
}

// Concerts in the viewer's country first, then everything else; each part
// stays in date order.
export function regionFirst(list: Concert[], countryCode: string | null): Concert[] {
  const cc = countryCode && /^[A-Z]{2}$/.test(countryCode) ? countryCode : null;
  if (!cc) return list;
  return [...list.filter((c) => c.country === cc), ...list.filter((c) => c.country !== cc)];
}

// One artist's worldwide concerts through the shared API cache (12h; tours
// are announced weeks ahead), so the artist tab, the Discover concerts list
// and the activity strip cost Ticketmaster one lookup per artist per twelve
// hours, whoever asks.
export function cachedArtistConcerts(artistName: string, spotifyArtistId?: string | null): Promise<Concert[]> {
  return withSpotifyCache(`concerts:v4:${artistName.toLowerCase()}:${spotifyArtistId ?? ''}`, 12 * 3600, () => fetchArtistConcerts(artistName, spotifyArtistId));
}

// The most relevant upcoming music events (Ticketmaster's own ranking) in a
// country, or worldwide, grouped by headliner: Discover's popular concerts.
// Two pages of 200 events, one request each, cached 12 hours per country —
// many artists for two requests instead of a lookup per artist.
export type PopularConcerts = { artist: string; photo: string | null; concerts: Concert[] }[];
export function popularConcerts(countryCode: string | null): Promise<PopularConcerts> {
  const cc = countryCode && /^[A-Z]{2}$/.test(countryCode) ? countryCode : null;
  return withSpotifyCache(`tm-popular:v1:${cc ?? 'world'}`, 12 * 3600, async () => {
    const byArtist = new Map<string, { artist: string; photo: string | null; concerts: Concert[] }>();
    for (const page of ['0', '1']) {
      const params: Record<string, string> = { classificationName: 'music', sort: 'relevance,desc', size: '200', page };
      if (cc) params.countryCode = cc;
      const events = await tm('/events.json', params).catch(() => null);
      const items = ((events?._embedded as { events?: TmEvent[] } | undefined)?.events) || [];
      for (const e of items) {
        const head = e._embedded?.attractions?.[0];
        if (!head || !e.dates?.start?.localDate || /parking|shuttle|upgrade|voucher|add-on|hotel package|tribute|vip package/i.test(e.name)) continue;
        const key = head.name.toLowerCase();
        const v = e._embedded?.venues?.[0];
        // The act's own Ticketmaster photo (square-ish, not too small): no
        // Spotify lookup for dozens of artists.
        const img = (head.images || []).filter((i) => (i.ratio === '1_1' || i.ratio === '4_3') && (i.width ?? 0) >= 300).sort((x, y) => (x.width ?? 0) - (y.width ?? 0))[0];
        const cur = byArtist.get(key) || { artist: head.name, photo: img?.url ?? null, concerts: [] };
        if (cur.concerts.some((c) => c.date === e.dates!.start!.localDate && c.city === (v?.city?.name ?? null))) continue;
        cur.concerts.push({
          id: e.id, date: e.dates.start.localDate, time: e.dates.start.localTime ?? null, name: e.name,
          venue: v?.name ?? null, city: v?.city?.name ?? null, country: v?.country?.countryCode ?? null, url: e.url ?? null,
        });
        byArtist.set(key, cur);
      }
      if (items.length < 200) break;
    }
    for (const a of byArtist.values()) a.concerts.sort((x, y) => x.date.localeCompare(y.date));
    return [...byArtist.values()];
  });
}
