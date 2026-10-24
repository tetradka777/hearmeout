'use client';

import { useApp } from '@/lib/AppContext';
import { useCachedJson } from '@/lib/cachedJson';
import type { RisingResponse } from '@/lib/risingArtists';
import { ArtistShelfCard, Shelf } from './ui/SuperCards';
import { useOpenArtist } from './ui/ArtistName';

// "Lesser-known artists": our picks first, then artists whose fans keep
// growing (lib/risingArtists, refreshed every two weeks). A card opens the
// artist page.
export function RisingArtists() {
  const { t } = useApp();
  const openArtist = useOpenArtist();
  const { data, failed } = useCachedJson<RisingResponse>('/api/rising');

  if (!data) {
    return (
      <section className="sh14">
        <div className="hd"><h2>{t('catalog.obscureArtists')}</h2></div>
        <p className="muted" style={{ fontWeight: 600 }}>{failed ? t('generic.loadError') : t('obscure.loading')}</p>
      </section>
    );
  }
  return (
    <Shelf title={t('catalog.obscureArtists')} sub={t('rising.sub')}>
      {data.pinned.map((a) => (
        <ArtistShelfCard key={`p:${a.id}`} name={a.name} id={a.id} photo={a.photo} sub={t('rising.pick')} onClick={() => openArtist(a.name, a.id)} />
      ))}
      {data.rising.map((a) => (
        <ArtistShelfCard key={`r:${a.name}`} name={a.name} photo={a.photo} sub={t('rising.grew', { pct: a.growth })} onClick={() => openArtist(a.name)} />
      ))}
    </Shelf>
  );
}
