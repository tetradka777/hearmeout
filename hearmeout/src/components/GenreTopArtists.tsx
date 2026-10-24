'use client';

import { useState } from 'react';
import { cachedPage } from '@/lib/cachedJson';
import { useApp } from '@/lib/AppContext';
import { usePaged } from '@/lib/usePaged';
import type { CatalogArtist } from '@/lib/spotifyCatalog';
import { ArtistShelfCard, Shelf } from './ui/SuperCards';

const GENRES = ['Rock', 'Hip-Hop', 'Electronic', 'R&B', 'Pop', 'Latin'];
const STEP = 10;

// "Top artists by genre": the genres as chips, the chosen genre's artists
// as an endless shelf of photo cards (Spotify's genre search, 10 a page).
export function GenreTopArtists({ onlyGenre }: { onlyGenre?: string }) {
  const { t, me, openSpotifyArtist } = useApp();
  const list = onlyGenre && onlyGenre !== 'all' ? GENRES.filter((g) => g === onlyGenre) : GENRES;
  const [picked, setPicked] = useState(list[0]);
  const genre = list.includes(picked) ? picked : list[0];
  const market = me?.region ? `&market=${encodeURIComponent(me.region)}` : '';
  const { items, done, failed, more } = usePaged<CatalogArtist, number>(async (offset) => {
    const from = offset ?? 0;
    const page = await cachedPage<CatalogArtist[]>(`/api/spotify/genre-artists?genre=${encodeURIComponent(genre)}&offset=${from}${market}`);
    return { items: page, next: !page.length || from + STEP >= 1000 ? null : from + STEP };
  }, (a) => a.id, [genre, market], 50);

  const chips = list.length > 1 && (
    <div className="chips" style={{ margin: '0 0 10px' }} role="group" aria-label={t('catalog.genreTops')}>
      {list.map((g) => <button key={g} className={`chip${g === genre ? ' on' : ''}`} aria-pressed={g === genre} onClick={() => setPicked(g)}>{g}</button>)}
    </div>
  );
  if (!items.length) {
    return (
      <section className="sh14">
        <div className="hd"><h2>{t('catalog.genreTops')}</h2></div>
        {chips}
        <p className="muted">{failed ? t('generic.loadError') : done ? t('genreTop.empty') : t('genreTop.loading')}</p>
      </section>
    );
  }
  return (
    <Shelf title={t('catalog.genreTops')} top={chips} onMore={more} done={done}>
      {items.map((ar, i) => (
        <ArtistShelfCard key={ar.id} name={ar.name} id={ar.id} photo={ar.photo} sub={`#${i + 1} · ${genre}`} onClick={() => openSpotifyArtist(ar.id, ar.name)} />
      ))}
    </Shelf>
  );
}
