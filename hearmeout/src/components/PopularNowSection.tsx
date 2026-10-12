'use client';

import { useEffect } from 'react';
import { useApp } from '@/lib/AppContext';
import { useCachedJson } from '@/lib/cachedJson';
import type { ChartAlbum } from '@/lib/appleCharts';
import { CoverArt } from './ui/CoverArt';

// "Popular now": this week's most played albums in your region (Apple
// Music's public chart, lib/appleCharts), not all-time stream totals.
// Layout: discoverHtml() "Popular now" — a scrolling row of cover, title,
// "artist · rank".
export function PopularNowSection({ limit = 12, genre }: { limit?: number; genre?: string }) {
  const { t, me, openAlbum } = useApp();
  const region = me?.region ? `?region=${encodeURIComponent(me.region)}` : '';
  const chart = useCachedJson<ChartAlbum[]>(`/api/charts/albums${region}`);
  // Apple's feed fails now and then: try again a little later.
  const { failed, reload } = chart;
  useEffect(() => {
    if (!failed) return;
    const timer = setTimeout(() => { reload(); }, 8000);
    return () => clearTimeout(timer);
  }, [failed, reload]);
  const ranked = (chart.data || [])
    .filter((a) => !genre || genre === 'Всё' || a.genreBucket === genre)
    .slice(0, limit);

  if (!chart.data && !chart.failed) return <p className="muted" style={{ fontWeight: 600 }}>{t('app.loading')}</p>;
  return (
    <div className="hrow">
      {ranked.length ? ranked.map((a) => (
        <button key={a.spotifyId} onClick={() => openAlbum(a.spotifyId)} style={{ textAlign: 'left', color: 'inherit' }}>
          <CoverArt url={a.cover ?? undefined} fallbackLetter={a.artist[0] || '?'} className="cov" px={170} style={{ width: '100%', aspectRatio: '1' }} />
          <b style={{ display: 'block', marginTop: 8, fontSize: 14 }}>{a.title}</b>
          <small className="muted" style={{ fontWeight: 700 }}>{a.artist} · {t('discover.rankN', { n: a.rank })}</small>
        </button>
      )) : <p className="muted" style={{ fontWeight: 600 }}>{t('discover.noneInGenre')}</p>}
    </div>
  );
}
