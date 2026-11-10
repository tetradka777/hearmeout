import { cachedDeezerArtistForSpotify, deezerArtistByName, deezerArtistFor } from './deezerServer';
import { fetchSpotifyArtistPhoto, searchSpotifyArtistPhotoExact } from './spotifyCatalog';
import { peekSpotifyCache, withSpotifyCache } from './spotifyCache';
import { normalizeArtistName } from './artistIdentity';

const DAY = 86400;
const SPOTIFY_ID = /^[A-Za-z0-9]{22}$/;
export type ArtistPhotoItem = { name: string; id?: string | null };

export async function artistPhotoFor({ name, id }: ArtistPhotoItem): Promise<string | null | undefined> {
  if (id) {
    if (!SPOTIFY_ID.test(id)) return null;
    let unavailable = false;
    try {
      const photo = await withSpotifyCache(`sp-aphoto:v1:${id}`, 90 * DAY, () => fetchSpotifyArtistPhoto(id));
      if (photo) return photo;
    } catch { unavailable = true; }
    try {
      // Recover missing pictures only through this exact Spotify id's
      // album-confirmed Deezer identity. A name alone is never a fallback.
      const confirmed = await cachedDeezerArtistForSpotify(id);
      if (confirmed?.photo) return confirmed.photo;
      const [raw, albums] = await Promise.all([
        peekSpotifyCache<{ name: string } | null>(`sp-artist-raw:v1:${id}`),
        peekSpotifyCache<{ released: { title: string }[]; upcoming?: { title: string }[] }>(`artistalbums:v1:${id}`),
      ]);
      const titles = [...(albums?.released || []), ...(albums?.upcoming || [])].map((a) => a.title);
      if (raw?.name && titles.length) {
        const dz = await deezerArtistFor(id, raw.name, titles);
        if (dz?.photo) return dz.photo;
      }
    } catch { unavailable = true; }
    return unavailable ? undefined : null;
  }
  let deezerUnavailable = false;
  try {
    const dz = await deezerArtistByName(name);
    if (dz?.exact && dz.unambiguous && dz.photo) return dz.photo;
  } catch { deezerUnavailable = true; }
  try {
    const hit = await withSpotifyCache(`sp-aexact:v3:${normalizeArtistName(name)}`, 90 * DAY, () => searchSpotifyArtistPhotoExact(name));
    // A transient Deezer failure is not evidence of a permanently absent
    // photo: omit this answer so the browser can ask again later.
    if (!hit.photo && deezerUnavailable) return undefined;
    return hit.photo;
  } catch {
    return undefined;
  }
}
