'use client';

import { useApp } from '@/lib/AppContext';
import { useCachedJson } from '@/lib/cachedJson';
import type { RisingResponse } from '@/lib/risingArtists';
import { ArtistAvatar, useOpenArtist } from './ui/ArtistName';

type Name = { key: string; name: string; id?: string; photo: string | null; sub: string };

// "Lesser-known artists": our picks first, then artists whose fans keep
// growing (lib/risingArtists, refreshed every two weeks). Two strips of big
// names running opposite ways, each with the artist's round photo before it;
// a name opens the artist page.
export function RisingArtists() {
  const { t } = useApp();
  const openArtist = useOpenArtist();
  const { data, failed } = useCachedJson<RisingResponse>('/api/rising');

  const head = <div className="hd"><h2>{t('catalog.obscureArtists')}</h2></div>;
  if (!data) {
    return (
      <section className="sh14">
        {head}
        <p className="muted" style={{ fontWeight: 600 }}>{failed ? t('generic.loadError') : t('obscure.loading')}</p>
      </section>
    );
  }
  const all: Name[] = [
    ...data.pinned.map((a) => ({ key: `p:${a.id}`, name: a.name, id: a.id, photo: a.photo, sub: t('rising.pick') })),
    ...data.rising.map((a) => ({ key: `r:${a.name}`, name: a.name, photo: a.photo, sub: t('rising.grew', { pct: a.growth }) })),
  ];
  if (!all.length) return null;
  const half = Math.ceil(all.length / 2);
  const rows = all.length > 3 ? [all.slice(0, half), all.slice(half).reverse()] : [all];

  return (
    <section className="sh14">
      {head}
      {rows.map((items, n) => (
        <div key={n} className={`dc22${n ? ' bk' : ''}`}>
          {/* The names twice over, so the loop has no seam; the copy is only
              for the eye. */}
          <div className="dct" style={{ animationDuration: `${Math.max(30, items.length * 7)}s` }}>
            {[0, 1].map((copy) => items.map((a) => (
              <DeepName key={`${copy}:${a.key}`} a={a} size={n ? 72 : 96} copy={copy === 1} onOpen={() => openArtist(a.name, a.id)} />
            )))}
          </div>
        </div>
      ))}
    </section>
  );
}

// One name of a strip with the artist's photo before it and a dot after, so
// it's clear which photo goes with which name (our picks' photos come by
// their Spotify id, like every artist avatar).
function DeepName({ a, size, copy, onOpen }: { a: Name; size: number; copy: boolean; onOpen: () => void }) {
  return (
    <>
    <button
      className="dcn"
      aria-hidden={copy || undefined}
      tabIndex={copy ? -1 : undefined}
      aria-label={`${a.name} · ${a.sub}`}
      onClick={onOpen}
    >
      <ArtistAvatar name={a.name} id={a.id} photo={a.photo} size={size} />
      <span>{a.name}</span>
    </button>
    <i className="dcs" aria-hidden="true" />
    </>
  );
}
