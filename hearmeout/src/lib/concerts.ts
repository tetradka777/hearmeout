import { withSpotifyCache } from './spotifyCache';

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

async function tm(path: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  const url = new URL(`${BASE}${path}`);
  url.searchParams.set('apikey', process.env.TICKETMASTER_API_KEY || '');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Ticketmaster request failed (${path}): ${res.status}`);
  return res.json();
}

type TmAttraction = { id: string; name: string };
type TmEvent = {
  id: string;
  name: string;
  url?: string;
  dates?: { start?: { localDate?: string; localTime?: string } };
  _embedded?: { venues?: { name?: string; city?: { name?: string }; country?: { countryCode?: string } }[] };
};

// Upcoming events for the artist worldwide, sorted by date. The viewer's
// region only changes the order (regionFirst), never what's included.
export async function fetchArtistConcerts(artistName: string): Promise<Concert[]> {
  const attractions = await tm('/attractions.json', { keyword: artistName, classificationName: 'music', size: '10' });
  const list = ((attractions._embedded as { attractions?: TmAttraction[] } | undefined)?.attractions) || [];
  const match = list.find((a) => a.name.toLowerCase() === artistName.toLowerCase());
  if (!match) return [];

  // Music events only (an attraction can also have sports or add-on events),
  // and no parking / upgrade / shuttle listings sold as separate events.
  const params: Record<string, string> = { attractionId: match.id, classificationName: 'music', sort: 'date,asc', size: '50' };
  const events = await tm('/events.json', params);
  const items = ((events._embedded as { events?: TmEvent[] } | undefined)?.events) || [];
  return items
    .filter((e) => e.dates?.start?.localDate && !/parking|shuttle|upgrade|voucher|add-on|hotel package/i.test(e.name))
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

// One artist's worldwide concerts through the shared API cache (6h), so the
// artist tab and the Discover concerts list cost Ticketmaster one lookup
// per artist per six hours, whoever asks.
export function cachedArtistConcerts(artistName: string): Promise<Concert[]> {
  return withSpotifyCache(`concerts:v3:${artistName.toLowerCase()}`, 6 * 3600, () => fetchArtistConcerts(artistName));
}
