import { supabaseAdmin } from './supabaseAdmin';
import { fetchAllRows } from './supabasePaginate';

// Community average and count per album (the album_ratings view). The same
// answer for everyone and read on every page load, so it's kept in this
// process for 30 seconds and dropped as soon as anyone rates. Read in pages:
// PostgREST returns at most 1000 rows, which would have cut off albums once
// more than a thousand were rated.
export type AlbumSummaryRow = { album_id: string; avg_stars: number; ratings_count: number };

const TTL_MS = 30 * 1000;
let memo: { at: number; rows: AlbumSummaryRow[] } | null = null;
let inflight: Promise<AlbumSummaryRow[]> | null = null;

export async function albumSummary(): Promise<AlbumSummaryRow[]> {
  if (memo && Date.now() - memo.at < TTL_MS) return memo.rows;
  if (inflight) return inflight;
  inflight = (async () => {
    const { rows, error } = await fetchAllRows<AlbumSummaryRow>((f, t) => supabaseAdmin().from('album_ratings').select('album_id, avg_stars, ratings_count').order('album_id').range(f, t), 50000, 4);
    if (error) throw new Error(error);
    memo = { at: Date.now(), rows };
    return rows;
  })().finally(() => { inflight = null; });
  return inflight;
}

export function clearAlbumSummary(): void {
  memo = null;
}
