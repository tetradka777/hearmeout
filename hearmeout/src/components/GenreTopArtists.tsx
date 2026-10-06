'use client';

import { useApp } from '@/lib/AppContext';

const GENRES = ['Rock', 'Hip-Hop', 'Electronic', 'R&B', 'Pop', 'Latin'];

// discoverHtml() "Top artists by genre": per genre an h3 "Genre · region"
// and a chip per artist (artChip: avatar dot + name).
function GenreRow({ genre, region }: { genre: string; region: string }) {
  const { t, spotifyGenreArtists, openSpotifyArtist } = useApp();
  const artists = spotifyGenreArtists[genre];

  return (
    <div style={{ marginBottom: 14 }}>
      <h3 style={{ marginBottom: 8 }}>{genre} <small className="muted" style={{ fontWeight: 700 }}>· {region}</small></h3>
      <div className="chips" style={{ margin: 0 }}>
        {artists === 'error' ? <span className="muted">{t('generic.loadError')}</span>
          : !artists ? <span className="muted">{t('genreTop.loading')}</span>
          : !artists.length ? <span className="muted">{t('genreTop.empty')}</span>
          : artists.map((ar) => (
            <button className="chip" key={ar.id} onClick={() => openSpotifyArtist(ar.id, ar.name)}>
              <span className="dot" style={ar.photo ? { backgroundImage: `url('${ar.photo}')`, backgroundSize: 'cover', color: 'transparent' } : undefined}>{ar.name[0]}</span>
              {ar.name}
            </button>
          ))}
      </div>
    </div>
  );
}

export function GenreTopArtists({ onlyGenre, region }: { onlyGenre?: string; region: string }) {
  const list = onlyGenre && onlyGenre !== 'Всё' ? GENRES.filter((g) => g === onlyGenre) : GENRES;
  return (
    <>
      {list.map((g) => <GenreRow key={g} genre={g} region={region} />)}
    </>
  );
}
