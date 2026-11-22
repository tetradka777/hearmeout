'use client';

import { resolveAlbum } from '@/lib/resolveAlbum';

import { useApp } from '@/lib/AppContext';
import { useCachedJson } from '@/lib/cachedJson';
import { formatRelative } from '@/lib/format';
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
    const result = await resolveAlbum(r.title, r.artist, r.artistId);
    if (!result.id) { showToast(t(result.error === 'not_found' ? 'toast.albumOpenFailed' : 'toast.albumUnavailable')); return; }
    openAlbum(result.id);
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
          meta={formatRelative(`${r.date}T00:00:00Z`, language)}
          onClick={() => open(r)}
        />
      ))}
    </Shelf>
  );
}
