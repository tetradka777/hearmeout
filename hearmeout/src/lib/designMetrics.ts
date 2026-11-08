// Use the recap's already fetched window and the existing Stats top-album
// ranking by listening time. Missing album identities stay unknown.
export function leadingAlbum(rows: { album_id: string | null; cover_url: string | null; duration_ms: number | null }[]) {
  const albums = new Map<string, { albumId: string; cover: string | null; plays: number; ms: number }>();
  for (const row of rows) {
    if (!row.album_id) continue;
    const album = albums.get(row.album_id) ?? { albumId: row.album_id, cover: null, plays: 0, ms: 0 };
    album.plays++;
    album.ms += row.duration_ms || 0;
    album.cover ||= row.cover_url;
    albums.set(row.album_id, album);
  }
  const first = [...albums.values()].sort((a, b) => b.ms - a.ms)[0];
  return first ? { albumId: first.albumId, cover: first.cover, plays: first.plays } : null;
}

// Largest remainder: rounding the complete distribution still adds to 100.
export function percentageShares(counts: number[]): number[] {
  const total = counts.reduce((sum, n) => sum + n, 0);
  if (!total) return counts.map(() => 0);
  const raw = counts.map((n) => n / total * 100);
  const shares = raw.map(Math.floor);
  const order = raw.map((n, i) => ({ i, remainder: n - shares[i] })).sort((a, b) => b.remainder - a.remainder || a.i - b.i);
  const remaining = 100 - shares.reduce((sum, n) => sum + n, 0);
  for (let i = 0; i < remaining; i++) shares[order[i].i]++;
  return shares;
}
