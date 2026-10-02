'use client';

import { useApp } from '@/lib/AppContext';
import { AlbumCard } from './ui/AlbumCard';

// Real data, not literally live: Spotify's dev-tier API has no accessible
// trending/charts endpoint (browse/new-releases and playlist tracks both
// 403 for this app, and /search isn't popularity-sorted) — confirmed by
// hand against the real API. `popularRank` instead ranks these albums by
// real, verified Spotify streaming totals sourced from kworb.net, so this
// section stays honest real data instead of a fake "live" feed.
export function PopularNowSection({ rowClass, limit = 12, genre }: { rowClass: string; limit?: number; genre?: string }) {
  const { t, albums } = useApp();
  const ranked = albums
    .filter((a) => a.popularRank != null && (!genre || genre === 'Всё' || a.genreBucket === genre))
    .sort((a, b) => (a.popularRank ?? 0) - (b.popularRank ?? 0))
    .slice(0, limit);

  if (!ranked.length) return <p className="muted" style={{ fontWeight: 600 }}>{t('discover.noneInGenre')}</p>;
  return <div className={rowClass}>{ranked.map((a) => <AlbumCard key={a.id} album={a} />)}</div>;
}
