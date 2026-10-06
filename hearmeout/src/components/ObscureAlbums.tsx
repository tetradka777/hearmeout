'use client';

import { useApp } from '@/lib/AppContext';

// discoverHtml() "Lesser-known artists": a row of artist tiles (letter
// circle, name, one line under it). The data is real low-popularity
// Spotify albums, so each artist appears once with the album that put
// them here; the tile opens the artist page (or the album without an id).
export function ObscureAlbums({ genre }: { genre: string }) {
  const { t, spotifyObscure, openAlbum, openSpotifyArtist } = useApp();
  const albums = spotifyObscure[genre];

  if (albums === 'error') return <p className="muted" style={{ fontWeight: 600 }}>{t('generic.loadError')}</p>;
  if (!albums) return <p className="muted" style={{ fontWeight: 600 }}>{t('obscure.loading')}</p>;
  if (!albums.length) return <p className="muted" style={{ fontWeight: 600 }}>{t('obscure.empty')}</p>;

  const seen = new Set<string>();
  const artists = albums.filter((a) => (seen.has(a.artist) ? false : (seen.add(a.artist), true)));
  return (
    <div className="hrow">
      {artists.map((a) => (
        <button className="tile" key={a.id} onClick={() => (a.artistId ? openSpotifyArtist(a.artistId, a.artist) : openAlbum(a.id))} style={{ textAlign: 'left', minWidth: 190 }}>
          <span className="ph" style={{ width: 64, height: 64, fontSize: 26, ...(a.cover ? { backgroundImage: `url('${a.cover}')`, backgroundSize: 'cover', color: 'transparent' } : {}) }}>{a.artist[0]}</span>
          <b style={{ display: 'block', marginTop: 10 }}>{a.artist}</b>
          <small className="muted" style={{ fontWeight: 700 }}>{a.title}</small>
        </button>
      ))}
    </div>
  );
}
