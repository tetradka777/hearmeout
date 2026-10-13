'use client';

import { useApp } from '@/lib/AppContext';
import { CoverArt } from './ui/CoverArt';
import { ArtistAvatar } from './ui/ArtistName';

// "Lesser-known artists" (prototype rev 11, lighter rows): real
// low-popularity Spotify albums, one row per artist (the album cover, the
// artist, the album that put them here); a row opens the artist page (or
// the album without an artist id).
export function ObscureAlbums({ genre }: { genre: string }) {
  const { t, spotifyObscure, openAlbum, openSpotifyArtist } = useApp();
  const albums = spotifyObscure[genre];

  if (albums === 'error') return <p className="muted" style={{ fontWeight: 600 }}>{t('generic.loadError')}</p>;
  if (!albums) return <p className="muted" style={{ fontWeight: 600 }}>{t('obscure.loading')}</p>;
  if (!albums.length) return <p className="muted" style={{ fontWeight: 600 }}>{t('obscure.empty')}</p>;

  const seen = new Set<string>();
  // Compilations ("Various Artists") aren't an artist to discover.
  const artists = albums.filter((a) => !/^various artists$/i.test(a.artist) && (seen.has(a.artist) ? false : (seen.add(a.artist), true))).slice(0, 6);
  return (
    <div className="tile t-soft2">
      {artists.map((a) => (
        <button className="row" key={a.id} onClick={() => (a.artistId ? openSpotifyArtist(a.artistId, a.artist) : openAlbum(a.id))}>
          <ArtistAvatar name={a.artist} id={a.artistId} size={44} />
          <span className="g"><b>{a.artist}</b><small className="muted">{a.title}</small></span>
          <CoverArt url={a.cover ?? undefined} fallbackLetter={a.artist[0] || '?'} className="cov" px={36} style={{ width: 36, height: 36 }} />
        </button>
      ))}
    </div>
  );
}
