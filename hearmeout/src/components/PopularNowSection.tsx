'use client';

import { useEffect } from 'react';
import { useApp } from '@/lib/AppContext';
import { useCachedJson } from '@/lib/cachedJson';
import { fmt1 } from '@/lib/numberFormat';
import type { ChartAlbum } from '@/lib/appleCharts';
import { CoverArt } from './ui/CoverArt';

// "Popular now": this week's most played albums in your region (Apple
// Music's public chart, lib/appleCharts), not all-time stream totals.
// Layout (prototype rev 10c/11): the #1 as a featured tile, #2–5 as rows.
export function PopularNowSection({ genre }: { genre?: string }) {
  const { t, me, myRatings, albumRatings, openAlbum } = useApp();
  const region = me?.region ? `?region=${encodeURIComponent(me.region)}` : '';
  const chart = useCachedJson<ChartAlbum[]>(`/api/charts/albums${region}`);
  // Apple's feed fails now and then: try again a little later.
  const { failed, reload } = chart;
  useEffect(() => {
    if (!failed) return;
    const timer = setTimeout(() => { reload(); }, 8000);
    return () => clearTimeout(timer);
  }, [failed, reload]);

  const ranked = (chart.data || []).filter((a) => !genre || genre === 'Всё' || a.genreBucket === genre).slice(0, 5);
  if (!chart.data && !chart.failed) return <p className="muted" style={{ fontWeight: 600 }}>{t('app.loading')}</p>;
  if (!ranked.length) return <p className="muted" style={{ fontWeight: 600 }}>{t('discover.noneInGenre')}</p>;

  const [first, ...rest] = ranked;
  const mine = myRatings.find((r) => r.albumId === first.spotifyId)?.stars;
  const community = albumRatings[first.spotifyId];
  return (
    <div className="pop10">
      <button className="tile t-ink glow pf10" onClick={() => openAlbum(first.spotifyId)}>
        <CoverArt url={first.cover ?? undefined} fallbackLetter={first.artist[0] || '?'} className="cov" px={200} style={{ width: 200, maxWidth: '100%', aspectRatio: '1' }} />
        <span className="pill">{t('discover.numberOneNow')}</span>
        <b className="disp">{first.title}</b>
        <small>{first.artist} · {t('discover.rankN', { n: first.rank })}</small>
        <span className="ln10 sm" style={{ marginTop: 6 }}>
          {community && <span><i className="ic ic-star" /><b>{t('discover.communityScore', { score: fmt1(community.avg), n: community.count })}</b></span>}
          <span><i className="ic ic-heart" /><b>{mine != null ? t('discover.youRatedIt', { score: fmt1(mine) }) : t('discover.notRatedYet')}</b></span>
        </span>
      </button>
      {rest.length > 0 && (
        <div className="tile">
          {rest.map((a, i) => (
            <button className="row" key={a.spotifyId} onClick={() => openAlbum(a.spotifyId)}>
              <span className="rk11">{i + 2}</span>
              <CoverArt url={a.cover ?? undefined} fallbackLetter={a.artist[0] || '?'} className="cov" px={44} style={{ width: 44, height: 44 }} />
              <span className="g"><b>{a.title}</b><small className="muted" style={{ fontWeight: 600 }}>{a.artist}{a.genreBucket ? ` · ${a.genreBucket}` : ''}</small></span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
