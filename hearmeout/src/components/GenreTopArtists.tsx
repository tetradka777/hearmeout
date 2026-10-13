'use client';

import { useState } from 'react';
import { useApp } from '@/lib/AppContext';
import { ArtistShelfCard } from './ui/SuperCards';

const GENRES = ['Rock', 'Hip-Hop', 'Electronic', 'R&B', 'Pop', 'Latin'];

// "Top artists by genre": the genres as chips, the chosen genre's artists
// as a shelf of photo cards (after Superfan's fandoms).
export function GenreTopArtists({ onlyGenre }: { onlyGenre?: string }) {
  const { t, spotifyGenreArtists, openSpotifyArtist } = useApp();
  const list = onlyGenre && onlyGenre !== 'Всё' ? GENRES.filter((g) => g === onlyGenre) : GENRES;
  const [picked, setPicked] = useState(list[0]);
  const genre = list.includes(picked) ? picked : list[0];
  const artists = spotifyGenreArtists[genre];

  return (
    <>
      {list.length > 1 && (
        <div className="chips" style={{ margin: '0 0 10px' }} role="group" aria-label={t('catalog.genreTops')}>
          {list.map((g) => <button key={g} className={`chip${g === genre ? ' on' : ''}`} aria-pressed={g === genre} onClick={() => setPicked(g)}>{g}</button>)}
        </div>
      )}
      {artists === 'error' ? <p className="muted">{t('generic.loadError')}</p>
        : !artists ? <p className="muted">{t('genreTop.loading')}</p>
        : !artists.length ? <p className="muted">{t('genreTop.empty')}</p>
        : (
          <div className="hrow sr14">
            {artists.slice(0, 10).map((ar, i) => (
              <ArtistShelfCard key={ar.id} name={ar.name} id={ar.id} photo={ar.photo} sub={`#${i + 1} · ${genre}`} onClick={() => openSpotifyArtist(ar.id, ar.name)} />
            ))}
          </div>
        )}
    </>
  );
}
