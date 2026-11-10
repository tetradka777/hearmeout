import { releaseNameKey } from './format';
import { normalizeArtistName } from './artistIdentity';

type AlbumIdentity = { title: string; artist: string };
export const discoveryKey = (album: AlbumIdentity) => `${normalizeArtistName(album.artist)}|${releaseNameKey(album.title)}`;

// Reviews get priority over a chart entry for the same album. The id and
// title/artist sets also exclude music already shown in the shelves above.
export function uniqueDiscovery<R extends { albumId: string }, A extends AlbumIdentity>(
  reviews: R[], albums: A[], lookup: (id: string) => AlbumIdentity | undefined,
  excludedIds: string[] = [], excludedAlbums: AlbumIdentity[] = [],
) {
  const ids = new Set(excludedIds);
  const keys = new Set(excludedAlbums.map(discoveryKey));
  const uniqueReviews = reviews.filter((review) => {
    const album = lookup(review.albumId);
    const key = album && discoveryKey(album);
    if (ids.has(review.albumId) || (key && keys.has(key))) return false;
    ids.add(review.albumId);
    if (key) keys.add(key);
    return true;
  });
  const uniqueAlbums = albums.filter((album) => {
    const key = discoveryKey(album);
    if (keys.has(key)) return false;
    keys.add(key);
    return true;
  });
  return { reviews: uniqueReviews, albums: uniqueAlbums };
}
