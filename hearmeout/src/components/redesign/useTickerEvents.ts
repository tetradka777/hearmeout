import { useApp } from '@/lib/AppContext';
import { useCachedJson } from '@/lib/cachedJson';
import { toLocale, type Language } from '@/lib/i18n';
import type { TickerNewsItem } from '@/lib/tickerNews';
import type { TickerNewsResponse } from '@/app/api/ticker/route';

// Activity-strip events (spec 3.8/7.9). First the viewer's and friends' own
// activity from the same /api/feed data Home already fetches (HomeScreen's
// effect fills AppContext's `feed`, and every screen stays mounted): today's
// biggest disagreement, then first plays, reviews and the viewer's session,
// newest first, at most 6. Then news from /api/ticker, so the strip isn't
// empty for someone whose friends are quiet: records, new and announced
// albums and concerts of the artists they listen to, then of the most
// popular artists. Empty only when there's nothing real at all.
export type TickerEvent = { id: string; name: string; text: string };

const OWN_MAX = 6;
const NEWS_MAX = 10;

// Through the browser's shared cache (lib/cachedJson): after a reload the
// strip starts with the last copy at once and refreshes quietly.
function useTickerNews(enabled: boolean, region: string | null): TickerNewsItem[] {
  const url = enabled ? `/api/ticker${region ? `?country=${encodeURIComponent(region)}` : ''}` : null;
  const items = useCachedJson<TickerNewsResponse>(url).data?.items;
  return enabled && items ? items : [];
}

function shortDate(iso: string, language: Language): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat(toLocale(language), { day: 'numeric', month: 'short' }).format(new Date(y, (m || 1) - 1, d || 1));
}

function placeOf(city: string | null, country: string | null, language: Language): string {
  let countryName = country;
  if (country) {
    try { countryName = new Intl.DisplayNames([toLocale(language)], { type: 'region' }).of(country) ?? country; } catch { /* keep the code */ }
  }
  return [city, countryName].filter(Boolean).join(', ');
}

export function useTickerEvents(): TickerEvent[] {
  const { t, language, me, feed, albums, liveAlbums } = useApp();
  const news = useTickerNews(!!me?.tickerEnabled, me?.region ?? null);
  if (!feed) return [];

  const albumTitle = (albumId: string) => (liveAlbums[albumId] || albums.find((a) => a.id === albumId))?.title ?? null;
  const events: TickerEvent[] = [];

  if (feed.hero) {
    const title = albumTitle(feed.hero.albumId);
    if (title) events.push({ id: 'hero', name: t('friend.you'), text: t('ticker.disagree', { friend: feed.hero.friend.name, album: title }) });
  }

  for (const [i, e] of feed.events.entries()) {
    if (events.length >= OWN_MAX) break;
    if (e.type === 'first_play') {
      events.push({ id: `fp-${i}-${e.at}`, name: e.user.name, text: t('ticker.firstPlay', { track: e.trackTitle }) });
    } else if (e.type === 'rating_review') {
      const title = albumTitle(e.albumId);
      if (title) events.push({ id: `rr-${i}-${e.at}`, name: e.user.name, text: t('ticker.rated', { album: title, stars: e.stars.toFixed(1) }) });
    } else if (e.type === 'session') {
      events.push({ id: `se-${i}-${e.at}`, name: t('ticker.youSubject'), text: t('ticker.session', { minutes: e.minutes }) });
    }
  }

  let added = 0;
  for (const n of news) {
    if (added >= NEWS_MAX) break;
    let ev: TickerEvent | null = null;
    if (n.kind === 'release') ev = { id: n.id, name: n.artist, text: t('ticker.release', { album: shortTitle(n.title) }) };
    else if (n.kind === 'upcoming') ev = { id: n.id, name: n.artist, text: t('ticker.upcoming', { album: shortTitle(n.title), date: shortDate(n.date, language) }) };
    else if (n.kind === 'concert') ev = { id: n.id, name: n.artist, text: t('ticker.concert', { date: shortDate(n.date, language), place: placeOf(n.city, n.country, language) }) };
    else if (n.kind === 'dayRecord') ev = { id: n.id, name: t('ticker.recordLabel'), text: t('ticker.dayRecord', { minutes: n.minutes }) };
    else if (n.kind === 'milestone') {
      ev = n.name
        ? { id: n.id, name: n.name, text: t('ticker.milestoneFriend', { count: n.count }) }
        : { id: n.id, name: t('ticker.youSubject'), text: t('ticker.milestoneMe', { count: n.count }) };
    } else if (n.kind === 'albumOfWeek') {
      const title = albumTitle(n.albumId);
      if (title) ev = { id: n.id, name: t('ticker.albumOfWeekLabel'), text: t('ticker.albumOfWeek', { album: title, count: n.count }) };
    }
    if (ev) { events.push(ev); added++; }
  }

  return events;
}

// A release's title without the extras that make a strip item endless:
// '(feat. …)', '[from …]', ' - single'.
function shortTitle(title: string): string {
  const short = title.replace(/\s*[([][^)\]]*[)\]]/g, '').replace(/\s+-\s+.*$/, '').trim();
  return short || title;
}
