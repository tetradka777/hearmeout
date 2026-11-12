import { ALBUMS } from './data';
import { fetchSpotifyAlbumDetail } from './spotifyCatalog';
import { withSpotifyCache } from './spotifyCache';

// Resolve only an explicit save, using the same long-lived cache as album pages.
// Never accept titles, artists or image URLs supplied by a client.
export async function musicEntryAlbum(albumId: string): Promise<{ albumId: string; title: string; artist: string; cover: string } | null> {
  const known = ALBUMS.find(a => a.id === albumId || a.spotifyId === albumId);
  if (known) return { albumId: known.id, title: known.title, artist: known.artist, cover: known.cover ?? '' };
  if (!/^[a-zA-Z0-9]{22}$/.test(albumId)) return null;
  const album = await withSpotifyCache(`album:${albumId}`, 180 * 86400, () => fetchSpotifyAlbumDetail(albumId));
  return album ? { albumId, title: album.title, artist: album.artist, cover: album.cover ?? '' } : null;
}
