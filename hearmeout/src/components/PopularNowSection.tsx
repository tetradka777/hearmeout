'use client';

import { useEffect } from 'react';
import { useApp } from '@/lib/AppContext';
import { useCachedJson } from '@/lib/cachedJson';
import { fmt1 } from '@/lib/numberFormat';
import type { ChartAlbum } from '@/lib/appleCharts';
import { AlbumShelfCard, Shelf } from './ui/SuperCards';

// "Popular now": this week's most played albums in your region (Apple
// Music's public chart, lib/appleCharts), not all-time stream totals. A
// shelf of cover cards (after Superfan's "hot new albums"): rank on the
// cover, then title, artist and the community score where there is one.
export function PopularNowSection({ genre }: { genre?: string }) {
  const { t, me, albumRatings, openAlbum } = useApp();
  const region = me?.region ? `?region=${encodeURIComponent(me.region)}` : '';
  const chart = useCachedJson<ChartAlbum[]>(`/api/charts/albums${region}`);
  // Apple's feed fails now and then: try again a little later.
  const { failed, reload } = chart;
  useEffect(() => {
    if (!failed) return;
    const timer = setTimeout(() => { reload(); }, 8000);
    return () => clearTimeout(timer);
  }, [failed, reload]);

  const ranked = (chart.data || []).filter((a) => !genre || genre === 'Всё' || a.genreBucket === genre).slice(0, 10);
  const body = !chart.data && !chart.failed ? <p className="muted" style={{ fontWeight: 600 }}>{t('app.loading')}</p>
    : !ranked.length ? <p className="muted" style={{ fontWeight: 600 }}>{t('discover.noneInGenre')}</p>
    : null;
  if (body) {
    return (
      <section className="sh14">
        <div className="hd"><h2>{t('catalog.popularNow')}</h2></div>
        <p className="muted sb">{t('catalog.popularNowSubtitle')}</p>
        {body}
      </section>
    );
  }
  return (
    <Shelf title={t('catalog.popularNow')} sub={t('catalog.popularNowSubtitle')}>
      {ranked.map((a) => {
        const community = albumRatings[a.spotifyId];
        return (
          <AlbumShelfCard
            key={a.spotifyId}
            cover={a.cover}
            title={a.title}
            artist={a.artist}
            badge={`#${a.rank}`}
            meta={community ? `★ ${fmt1(community.avg)} · ${t('groups.ratingsN', { n: community.count })}` : a.genreBucket || undefined}
            onClick={() => openAlbum(a.spotifyId)}
          />
        );
      })}
    </Shelf>
  );
}
