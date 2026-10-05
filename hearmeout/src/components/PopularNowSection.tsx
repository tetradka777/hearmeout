'use client';

import { useApp } from '@/lib/AppContext';
import { CoverArt } from './ui/CoverArt';

// Real data, not literally live: Spotify's dev-tier API has no accessible
// trending/charts endpoint (browse/new-releases and playlist tracks both
// 403 for this app, and /search isn't popularity-sorted) — confirmed by
// hand against the real API. `popularRank` instead ranks these albums by
// real, verified Spotify streaming totals sourced from kworb.net, so this
// section stays honest real data instead of a fake "live" feed.
// Layout: discoverHtml() "Popular now" — a scrolling row of cover, title,
// "artist · rank".
export function PopularNowSection({ limit = 12, genre }: { limit?: number; genre?: string }) {
  const { t, albums, spotifyCovers, openAlbum } = useApp();
  const ranked = albums
    .filter((a) => a.popularRank != null && (!genre || genre === 'Всё' || a.genreBucket === genre))
    .sort((a, b) => (a.popularRank ?? 0) - (b.popularRank ?? 0))
    .slice(0, limit);

  return (
    <div className="hrow">
      {ranked.length ? ranked.map((a) => (
        <button key={a.id} onClick={() => openAlbum(a.id)} style={{ textAlign: 'left', color: 'inherit' }}>
          <CoverArt url={spotifyCovers[a.id] || a.cover} fallbackLetter={a.artist[0] || '?'} className="cov" style={{ width: '100%', aspectRatio: '1' }} />
          <b style={{ display: 'block', marginTop: 8, fontSize: 14 }}>{a.title}</b>
          <small className="muted" style={{ fontWeight: 700 }}>{a.artist} · {t('discover.rankN', { n: a.popularRank! })}</small>
        </button>
      )) : <p className="muted" style={{ fontWeight: 600 }}>{t('discover.noneInGenre')}</p>}
    </div>
  );
}
