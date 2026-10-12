'use client';

import { useState } from 'react';
import { useApp } from '@/lib/AppContext';
import { CoverArt } from './ui/CoverArt';

const GENRES = ['Rock', 'Hip-Hop', 'Electronic', 'R&B', 'Pop', 'Latin'];

// "Top artists by genre" (prototype rev 10c/11): one tile, the genres as
// chips, the chosen genre's artists as rows (photo, name, rank).
export function GenreTopArtists({ onlyGenre }: { onlyGenre?: string }) {
  const { t, spotifyGenreArtists, openSpotifyArtist } = useApp();
  const list = onlyGenre && onlyGenre !== 'Всё' ? GENRES.filter((g) => g === onlyGenre) : GENRES;
  const [picked, setPicked] = useState(list[0]);
  const genre = list.includes(picked) ? picked : list[0];
  const artists = spotifyGenreArtists[genre];

  return (
    <div className="tile">
      {list.length > 1 && (
        <div className="chips" style={{ margin: '0 0 6px' }} role="group" aria-label={t('catalog.genreTops')}>
          {list.map((g) => <button key={g} className={`chip${g === genre ? ' on' : ''}`} aria-pressed={g === genre} onClick={() => setPicked(g)}>{g}</button>)}
        </div>
      )}
      {artists === 'error' ? <p className="muted">{t('generic.loadError')}</p>
        : !artists ? <p className="muted">{t('genreTop.loading')}</p>
        : !artists.length ? <p className="muted">{t('genreTop.empty')}</p>
        : artists.slice(0, 6).map((ar, i) => (
          <button className="row" key={ar.id} onClick={() => openSpotifyArtist(ar.id, ar.name)}>
            <span className="rk11">{i + 1}</span>
            <CoverArt url={ar.photo ?? undefined} fallbackLetter={ar.name[0] || '?'} className="cov" px={44} style={{ width: 44, height: 44, borderRadius: '50%' }} />
            <span className="g"><b>{ar.name}</b><small className="muted">{genre}</small></span>
          </button>
        ))}
    </div>
  );
}
