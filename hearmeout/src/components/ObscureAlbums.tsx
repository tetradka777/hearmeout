'use client';

import { useApp } from '@/lib/AppContext';
import { ArtistShelfCard } from './ui/SuperCards';

// "Lesser-known artists": real low-popularity Spotify albums, one card per
// artist (their photo, the album that put them here); a card opens the
// artist page (or the album without an artist id).
export function ObscureAlbums({ genre }: { genre: string }) {
  const { t, spotifyObscure, openAlbum, openSpotifyArtist } = useApp();
  const albums = spotifyObscure[genre];

  if (albums === 'error') return <p className="muted" style={{ fontWeight: 600 }}>{t('generic.loadError')}</p>;
  if (!albums) return <p className="muted" style={{ fontWeight: 600 }}>{t('obscure.loading')}</p>;
  if (!albums.length) return <p className="muted" style={{ fontWeight: 600 }}>{t('obscure.empty')}</p>;

  const seen = new Set<string>();
  // Compilations ("Various Artists") aren't an artist to discover.
  const artists = albums.filter((a) => !/^various artists$/i.test(a.artist) && (seen.has(a.artist) ? false : (seen.add(a.artist), true))).slice(0, 8);
  return (
    <div className="hrow sr14">
      {artists.map((a) => (
        <ArtistShelfCard key={a.id} name={a.artist} id={a.artistId} sub={a.title} onClick={() => (a.artistId ? openSpotifyArtist(a.artistId, a.artist) : openAlbum(a.id))} />
      ))}
    </div>
  );
}
