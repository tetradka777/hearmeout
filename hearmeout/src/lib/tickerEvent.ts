import type { TickerNewsItem } from './tickerNews';
import { toLocale, type Language, type TranslationKey } from './i18n';
import { shortTitle } from './format';
export type TickerEvent = { id: string; name: string; text: string; highlights?: string[] };
type T = (key: TranslationKey, vars?: Record<string, string | number>) => string;

// Highlight the exact values used in the localized sentence, never guessed
// names/dates parsed out of prose. This does not request any additional data.
export function newsTickerEvent(n: TickerNewsItem, language: Language, t: T, albumTitle: (id: string) => string | null): TickerEvent | null {
  const date = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Intl.DateTimeFormat(toLocale(language), { day: 'numeric', month: 'short' }).format(new Date(y, (m || 1) - 1, d || 1));
  };
  if (n.kind === 'release') {
    const album = shortTitle(n.title);
    return { id: n.id, name: n.artist, text: t('ticker.release', { album }), highlights: [album] };
  }
  if (n.kind === 'upcoming') {
    const album = shortTitle(n.title), when = date(n.date);
    return { id: n.id, name: n.artist, text: t('ticker.upcoming', { album, date: when }), highlights: [album, when] };
  }
  if (n.kind === 'concert') {
    let country = n.country;
    if (country) { try { country = new Intl.DisplayNames([toLocale(language)], { type: 'region' }).of(country) ?? country; } catch { /* keep the code */ } }
    const place = [n.city, country].filter(Boolean).join(', '), when = date(n.date);
    return { id: n.id, name: n.artist, text: t('ticker.concert', { date: when, place }), highlights: [when, place] };
  }
  if (n.kind === 'dayRecord') return { id: n.id, name: t('ticker.recordLabel'), text: t('ticker.dayRecord', { minutes: n.minutes }), highlights: [String(n.minutes)] };
  if (n.kind === 'milestone') return { id: n.id, name: n.name || t('ticker.youSubject'), text: t(n.name ? 'ticker.milestoneFriend' : 'ticker.milestoneMe', { count: n.count }), highlights: [String(n.count)] };
  const album = albumTitle(n.albumId);
  return album ? { id: n.id, name: t('ticker.albumOfWeekLabel'), text: t('ticker.albumOfWeek', { album, count: n.count }), highlights: [album, String(n.count)] } : null;
}
