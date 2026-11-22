import { normalizeTitle } from './deezerServer';
import { normalizeArtistName } from './artistIdentity';
type SearchAlbum = { id: string; name: string; artists: {id: string; name: string}[] };
export const albumSearchTitle = (title: string): string => title.replace(/\s+[-–—]\s+(?:EP|Single)\s*$/i, '').trim();
export function selectAlbumMatch(items: SearchAlbum[], title: string, artist: string, artistId?: string | null): string | null {
  const wantTitle = normalizeTitle(albumSearchTitle(title));
  const wantArtist = normalizeArtistName(artist);
  // Credits are structured in Spotify. Compare whole names or the whole
  // joined credit, never fragments of a name containing punctuation.
  const byArtist = items.filter((a) => artistId ? a.artists?.some((x) => x.id === artistId) : a.artists?.some((x) => normalizeArtistName(x.name) === wantArtist)
    || normalizeArtistName(a.artists?.map((x) => x.name).join(', ') || '') === wantArtist
    || normalizeArtistName(a.artists?.map((x) => x.name).join(' & ') || '') === wantArtist);
  const matches = byArtist.filter((a) => normalizeTitle(albumSearchTitle(a.name)) === wantTitle);
  if (!artistId) {
    const identities = new Set(matches.map((a) => {
      const exact = a.artists.filter((x) => normalizeArtistName(x.name) === wantArtist);
      return (exact.length ? exact : a.artists).map((x) => x.id).sort().join(',');
    }));
    if (identities.size > 1) return null;
  }
  return matches[0]?.id ?? null;
}
