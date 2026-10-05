import { useApp } from '@/lib/AppContext';

// Real activity-strip events (spec 3.8/7.9), sourced from the same /api/feed
// data Home already fetches (HomeScreen's effect populates AppContext's
// `feed` on mount, and every screen stays mounted, so it's already there
// regardless of which screen is active). Previously six hardcoded strings
// (redesign fix B3) — now built from feed.hero (a real disagreement) and
// feed.events (real first-play/rating/session rows), newest first, capped
// at 6 like the prototype. Empty when there's nothing real to show, so the
// Ticker hides itself instead of displaying invented people.
export type TickerEvent = { id: string; name: string; text: string };

export function useTickerEvents(): TickerEvent[] {
  const { t, feed, albums, liveAlbums } = useApp();
  if (!feed) return [];

  const albumTitle = (albumId: string) => (liveAlbums[albumId] || albums.find((a) => a.id === albumId))?.title ?? null;
  const events: TickerEvent[] = [];

  if (feed.hero) {
    const title = albumTitle(feed.hero.albumId);
    if (title) events.push({ id: 'hero', name: t('friend.you'), text: t('ticker.disagree', { friend: feed.hero.friend.name, album: title }) });
  }

  for (const e of feed.events) {
    if (e.type === 'first_play') {
      events.push({ id: `fp-${e.at}`, name: e.user.name, text: t('ticker.firstPlay', { track: e.trackTitle }) });
    } else if (e.type === 'rating_review') {
      const title = albumTitle(e.albumId);
      if (title) events.push({ id: `rr-${e.at}`, name: e.user.name, text: t('ticker.rated', { album: title, stars: e.stars.toFixed(1) }) });
    } else if (e.type === 'session') {
      events.push({ id: `se-${e.at}`, name: t('friend.you'), text: t('ticker.session', { minutes: e.minutes }) });
    }
    if (events.length >= 6) break;
  }

  return events;
}
