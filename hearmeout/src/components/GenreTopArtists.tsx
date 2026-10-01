'use client';

import { useApp } from '@/lib/AppContext';
import { CoverArt } from './ui/CoverArt';

const GENRES = ['Rock', 'Hip-Hop', 'Electronic', 'R&B', 'Pop', 'Latin'];

function GenreRow({ genre, rowClass }: { genre: string; rowClass: string }) {
  const { t, spotifyGenreArtists, openSpotifyArtist } = useApp();
  const artists = spotifyGenreArtists[genre];

  return (
    <div>
      <div className="setrow" style={{ border: 0, padding: 0, marginBottom: 10 }}>
        <h3 style={{ marginBottom: 0 }}>{genre}</h3>
        <small className="muted">Spotify</small>
      </div>
      {artists === 'error' ? (
        <p className="muted">{t('generic.loadError')}</p>
      ) : !artists ? (
        <p className="muted">{t('genreTop.loading')}</p>
      ) : artists.length ? (
        <div className={rowClass}>
          {artists.map((ar) => (
            <button className="cvw" key={ar.id} onClick={() => openSpotifyArtist(ar.id)} style={{ textAlign: 'left', width: '100%' }}>
              <CoverArt url={ar.photo ?? undefined} fallbackLetter={ar.name[0] || '?'} className="cov" style={{ width: '100%', aspectRatio: '1', borderRadius: '50%' }} />
              <div style={{ marginTop: 8 }}><b>{ar.name}</b></div>
            </button>
          ))}
        </div>
      ) : (
        <p className="muted">{t('recap.noData')}</p>
      )}
    </div>
  );
}

export function GenreTopArtists({ rowClass }: { rowClass: string }) {
  return (
    <>
      {GENRES.map((g) => <GenreRow key={g} genre={g} rowClass={rowClass} />)}
    </>
  );
}
