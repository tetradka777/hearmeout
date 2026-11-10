// Artist punctuation belongs to the name: commas, ampersands and words
// such as "live" must never be stripped using album-title normalization.
export function normalizeArtistName(name: string): string {
  return name.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
}

// A known full artist name may lead a joined credit. Never obtain that
// name by splitting the credit: "Tyler, The Creator" is a single artist.
export function artistCreditStartsWith(credit: string, name: string): boolean {
  const full = normalizeArtistName(credit);
  const artist = normalizeArtistName(name);
  return !!artist && (full === artist || full.startsWith(`${artist}, `));
}

export type ArtistIdentity = { name: string; id?: string | null; albumTitles?: string[] };
export type ListeningArtistRow = { artist: string | null; artist_id?: string | null; duration_ms: number | null; album?: string | null };

// Listening history stores joined display credits plus the primary Spotify
// id. Keep that id and full name; a cached canonical name can shorten a
// collaboration credit safely, without inventing a comma-separated artist.
export function rankListeningArtists(rows: ListeningArtistRow[], names: Map<string, string> = new Map()): (ArtistIdentity & { ms: number })[] {
  const artists = new Map<string, ArtistIdentity & { ms: number; albumTitles: string[] }>();
  for (const row of rows) {
    const id = row.artist_id || null;
    const name = (id && names.get(id)) || row.artist?.trim();
    if (!name) continue;
    const key = id ? `#${id}` : normalizeArtistName(name);
    const artist = artists.get(key) || { name, id, ms: 0, albumTitles: [] };
    if (id && !names.has(id) && name.length < artist.name.length && artistCreditStartsWith(artist.name, name)) artist.name = name;
    artist.ms += row.duration_ms || 0;
    if (row.album && !artist.albumTitles.includes(row.album)) artist.albumTitles.push(row.album);
    artists.set(key, artist);
  }
  return [...artists.values()].sort((a, b) => b.ms - a.ms);
}
