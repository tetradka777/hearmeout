'use client';

import { useApp } from '@/lib/AppContext';
import { cachedPage } from '@/lib/cachedJson';
import { usePaged } from '@/lib/usePaged';
import type { CatalogAlbum } from '@/lib/spotifyCatalog';
import { ArtistShelfCard, Shelf } from './ui/SuperCards';

const STEP = 10;

// "Lesser-known artists": real low-popularity Spotify albums, one card per
// artist (their photo, the album that put them here), endlessly 10 albums
// a page; a card opens the artist page (or the album without an artist id).
export function ObscureAlbums({ genre, sub }: { genre: string; sub?: string }) {
  const { t, me, openAlbum, openSpotifyArtist } = useApp();
  const market = me?.region ? `&market=${encodeURIComponent(me.region)}` : '';
  const { items, done, failed, more } = usePaged<CatalogAlbum, number>(async (offset) => {
    const from = offset ?? 0;
    const page = await cachedPage<CatalogAlbum[]>(`/api/spotify/obscure?genre=${encodeURIComponent(genre)}&offset=${from}${market}`);
    // Compilations ("Various Artists") aren't an artist to discover.
    return { items: page.filter((a) => !/^various artists$/i.test(a.artist)), next: !page.length || from + STEP >= 1000 ? null : from + STEP };
  }, (a) => (a.artistId || a.artist).toLowerCase(), [genre, market], 50);

  if (!items.length) {
    return (
      <section className="sh14">
        <div className="hd"><h2>{t('catalog.obscureArtists')}</h2></div>
        {sub && <p className="muted sb">{sub}</p>}
        <p className="muted" style={{ fontWeight: 600 }}>{failed ? t('generic.loadError') : done ? t('obscure.empty') : t('obscure.loading')}</p>
      </section>
    );
  }
  return (
    <Shelf title={t('catalog.obscureArtists')} sub={sub} onMore={more} done={done}>
      {items.map((a) => (
        <ArtistShelfCard key={a.id} name={a.artist} id={a.artistId} sub={a.title} onClick={() => (a.artistId ? openSpotifyArtist(a.artistId, a.artist) : openAlbum(a.id))} />
      ))}
    </Shelf>
  );
}
