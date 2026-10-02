'use client';

import { useApp } from '@/lib/AppContext';
import { CoverArt } from './ui/CoverArt';

const GENRES = ['Rock', 'Hip-Hop', 'Electronic', 'R&B', 'Pop', 'Latin'];

function GenreRow({ genre, rowClass, region }: { genre: string; rowClass: string; region: string }) {
  const { t, spotifyGenreArtists, openSpotifyArtist } = useApp();
  const artists = spotifyGenreArtists[genre];

  return (
    <div style={{ marginBottom: 14 }}>
      <div className="setrow" style={{ border: 0, padding: 0, marginBottom: 10 }}>
        <h3 style={{ marginBottom: 0 }}>{genre} <small className="muted" style={{ fontWeight: 700 }}>· {region}</small></h3>
      </div>
      {artists === 'error' ? (
        <p className="muted">{t('generic.loadError')}</p>
      ) : !artists ? (
        <p className="muted">{t('genreTop.loading')}</p>
      ) : artists.length === 0 ? (
        <p className="muted">{t('genreTop.empty')}</p>
      ) : (
        <div className={rowClass}>
          {artists.map((ar) => (
            <button className="cvw" key={ar.id} onClick={() => openSpotifyArtist(ar.id)} style={{ textAlign: 'left' }}>
              <CoverArt url={ar.photo ?? undefined} fallbackLetter={ar.name[0] || '?'} className="cov" style={{ width: '100%', aspectRatio: '1', borderRadius: '50%' }} />
              <div style={{ marginTop: 8 }}><b>{ar.name}</b></div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function GenreTopArtists({ rowClass, onlyGenre, region }: { rowClass: string; onlyGenre?: string; region: string }) {
  const list = onlyGenre && onlyGenre !== 'Всё' ? GENRES.filter((g) => g === onlyGenre) : GENRES;
  return (
    <>
      {list.map((g) => <GenreRow key={g} genre={g} rowClass={rowClass} region={region} />)}
    </>
  );
}
