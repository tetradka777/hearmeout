'use client';

import { useApp } from '@/lib/AppContext';
import { cachedJson, cachedPage } from '@/lib/cachedJson';
import { fmt1 } from '@/lib/numberFormat';
import { usePaged } from '@/lib/usePaged';
import type { ChartAlbum, ChartAlbumLite } from '@/lib/appleCharts';
import { AlbumShelfCard, Shelf } from './ui/SuperCards';

type Item = ChartAlbumLite & { spotifyId?: string };

// "Popular now": this week's most played albums (Apple Music's public
// charts, lib/appleCharts) — your region's chart first, matched to Spotify,
// then endlessly on: the top 100 of your country and then of other big
// markets (/api/charts/more), each album once. Those are matched to
// Spotify only when opened.
export function PopularNowSection({ genre }: { genre?: string }) {
  const { t, me, albumRatings, openAlbum, showToast } = useApp();
  const region = me?.region ? encodeURIComponent(me.region) : '';
  const fits = (a: { genreBucket: string | null }) => !genre || genre === 'all' || a.genreBucket === genre;
  const { items, done, failed, more } = usePaged<Item, number>(async (page) => {
    if (page === null) {
      const top = await cachedJson<ChartAlbum[]>(`/api/charts/albums${region ? `?region=${region}` : ''}`);
      return { items: (top || []).filter(fits).map((a) => ({ ...a, country: me?.region || 'us' })), next: 0 };
    }
    const d = await cachedPage<{ albums: ChartAlbumLite[]; next: number | null }>(`/api/charts/more?page=${page}${region ? `&region=${region}` : ''}`);
    return { items: d.albums.filter(fits), next: d.next };
  }, (a) => `${a.title}|${a.artist}`.toLowerCase(), [region, genre], 50);

  const open = async (a: Item) => {
    if (a.spotifyId) { openAlbum(a.spotifyId); return; }
    const res = await fetch(`/api/spotify/resolve-album?title=${encodeURIComponent(a.title)}&artist=${encodeURIComponent(a.artist)}`).catch(() => null);
    if (!res?.ok) { showToast(t('toast.albumOpenFailed')); return; }
    openAlbum((await res.json()).id);
  };

  if (!items.length) {
    return (
      <section className="sh14">
        <div className="hd"><h2>{t('catalog.popularNow')}</h2></div>
        <p className="muted" style={{ fontWeight: 600 }}>{done || failed ? t('discover.noneInGenre') : t('app.loading')}</p>
      </section>
    );
  }
  return (
    <Shelf title={t('catalog.popularNow')} onMore={more} done={done}>
      {items.map((a, i) => {
        const community = a.spotifyId ? albumRatings[a.spotifyId] : undefined;
        return (
          <AlbumShelfCard
            key={`${a.title}|${a.artist}`}
            cover={a.cover}
            title={a.title}
            artist={a.artist}
            badge={`#${i + 1}`}
            meta={community ? `★ ${fmt1(community.avg)} · ${t('groups.ratingsN', { n: community.count })}` : undefined}
            onClick={() => open(a)}
          />
        );
      })}
    </Shelf>
  );
}
