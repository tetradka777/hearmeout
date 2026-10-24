'use client';

import { useApp } from '@/lib/AppContext';
import { useCachedJson } from '@/lib/cachedJson';
import { toLocale } from '@/lib/i18n';
import type { FanClubRelease } from '@/app/api/fanclubs/releases/route';
import { AlbumShelfCard, Shelf } from './ui/SuperCards';

// Discover → "fan club releases": the latest releases of the artists whose
// fan clubs you're in. A card opens the album (found on Spotify by title
// and artist when tapped). Hidden without fan clubs or releases.
export function FanClubReleases() {
  const { t, language, openAlbum, showToast } = useApp();
  const { data } = useCachedJson<FanClubRelease[]>('/api/fanclubs/releases');
  if (!data?.length) return null;
  const open = async (r: FanClubRelease) => {
    const res = await fetch(`/api/spotify/resolve-album?title=${encodeURIComponent(r.title)}&artist=${encodeURIComponent(r.artist)}`).catch(() => null);
    if (!res?.ok) { showToast(t('toast.albumOpenFailed')); return; }
    openAlbum((await res.json()).id);
  };
  return (
    <Shelf title={t('fanclub.releasesTitle')}>
      {data.map((r) => (
        <AlbumShelfCard
          key={`${r.artistId}:${r.title}`}
          cover={r.cover}
          title={r.title}
          artist={r.artist}
          artistId={r.artistId}
          meta={new Date(`${r.date}T00:00:00Z`).toLocaleDateString(toLocale(language), { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}
          onClick={() => open(r)}
        />
      ))}
    </Shelf>
  );
}
