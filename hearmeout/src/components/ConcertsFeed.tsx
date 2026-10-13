'use client';

import { useEffect, useState } from 'react';
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
  const [data, setData] = useState<{ configured: boolean; items: ConcertFeedItem[] } | null>(null);
  const region = me?.region ?? null;

  useEffect(() => {
    if (!me) return;
    let cancelled = false;
    fetch(`/api/concerts${region ? `?country=${encodeURIComponent(region)}` : ''}`)
      .then((r) => (r.ok ? r.json() : { configured: false, items: [] }))
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setData({ configured: false, items: [] }); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id, region]);

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
            {rows.map((c) => {
              const d = new Date(`${c.date}T00:00:00Z`);
              const place = [c.city, c.country && c.country !== region ? regionDisplayName(c.country, language) : null].filter(Boolean).join(', ');
              return (
                <div className="cc14" key={`${c.artist}-${c.id}`}>
                  <ArtistShelfCard name={c.artist} sub={`${d.toLocaleDateString(loc, { day: 'numeric', month: 'short', timeZone: 'UTC' })} · ${place || c.venue || ''}`} onClick={() => openArtist(c.artist)} />
                  {c.url && <a className="tk" href={c.url} target="_blank" rel="noreferrer">{t('artist.tickets')}</a>}
                </div>
              );
            })}
          </Shelf>
        );
      })}
    </>
  );
}
