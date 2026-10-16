'use client';

import { useCachedJson } from '@/lib/cachedJson';
import { useOpenArtist } from './ui/ArtistName';
import { ArtistShelfCard, Shelf } from './ui/SuperCards';
import { useApp } from '@/lib/AppContext';
import { toLocale, regionDisplayName } from '@/lib/i18n';
import type { ConcertFeedItem } from '@/app/api/concerts/route';

// Discover → "Concerts": your most-listened artists first, then the most
// popular ones; your country's shows lead within each artist. Hidden when
// the server has no TICKETMASTER_API_KEY or nothing is announced.
export function ConcertsFeed() {
  const { t, language, me } = useApp();
  const openArtist = useOpenArtist();
  const region = me?.region ?? null;
  // Through the browser's shared cache: shown at once on a later visit.
  const data = useCachedJson<{ configured: boolean; items: ConcertFeedItem[] }>(me ? `/api/concerts${region ? `?country=${encodeURIComponent(region)}` : ''}` : null).data;

  if (!data || !data.configured || !data.items.length) return null;
  const loc = toLocale(language);
  const groups: ['yours' | 'popular', string][] = [['yours', t('concerts.yours')], ['popular', t('concerts.popular')]];

  return (
    <>
      {groups.map(([g, label]) => {
        const rows = data.items.filter((c) => c.group === g);
        if (!rows.length) return null;
        return (
          <Shelf
            key={g}
            title={`${t('concerts.title')} · ${label}`}
            sub={region ? t('concerts.subRegion', { region: regionDisplayName(region, language) }) : t('concerts.subWorld')}
          >
            {[...new Map(rows.map((c) => [c.artist, rows.filter((x) => x.artist === c.artist)])).entries()].map(([artist, shows]) => (
              // One card per artist, every date under it.
              <div className="cc14" key={artist}>
                <ArtistShelfCard name={artist} id={shows[0].artistId} sub={t('concerts.datesN', { n: shows.length })} onClick={() => openArtist(artist, shows[0].artistId)} />
                <ul className="cdl15">
                  {shows.map((c) => {
                    const d = new Date(`${c.date}T00:00:00Z`);
                    const place = [c.city, c.country && c.country !== region ? regionDisplayName(c.country, language) : null].filter(Boolean).join(', ') || c.venue || '';
                    const label = `${d.toLocaleDateString(loc, { day: 'numeric', month: 'short', timeZone: 'UTC' })} · ${place}`;
                    return (
                      <li key={c.id}>
                        {c.url ? <a href={c.url} target="_blank" rel="noreferrer">{label}</a> : <span>{label}</span>}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </Shelf>
        );
      })}
    </>
  );
}
