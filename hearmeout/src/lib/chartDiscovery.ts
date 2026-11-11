import type { ChartAlbumLite } from './appleCharts';
import { discoveryKey } from './homeDiscovery';

// Alternate music markets before revisiting their next slice. The local chart
// stays represented, but never fills the entire discovery page by itself.
const MARKETS = ['jp', 'br', 'gb', 'kr', 'mx', 'fr', 'de', 'in', 'es', 'au', 'za', 'it', 'ca', 'se', 'nl', 'pl', 'tr', 'ar', 'ie', 'us'];
export function discoveryMarkets(region: string | null): string[] {
  const own = region && /^[a-z]{2}$/i.test(region) ? region.toLowerCase() : 'us';
  return [own, ...MARKETS.filter(country => country !== own)];
}

export async function mixedChartPage(
  page: number, markets: readonly string[], load: (country: string) => Promise<ChartAlbumLite[]>,
): Promise<{ albums: ChartAlbumLite[]; next: number | null }> {
  const groups = Math.ceil(markets.length / 3);
  const pages = groups * Math.ceil(100 / 6);
  const index = Number.isFinite(page) ? Math.max(0, Math.floor(page)) : 0;
  if (index >= pages || !groups) return { albums: [], next: null };
  const start = (index % groups) * 3;
  const offset = Math.floor(index / groups) * 6;
  // At most three cached public-chart reads; no catalogue/Spotify matching.
  const results = await Promise.allSettled(markets.slice(start, start + 3).map(async country => (await load(country)).slice(offset, offset + 6)));
  if (results.every(result => result.status === 'rejected')) throw new Error('Charts unavailable');
  const slices = results.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
  const albums: ChartAlbumLite[] = [];
  const seen = new Set<string>();
  for (let row = 0; row < 6; row++) for (const slice of slices) {
    const album = slice[row];
    if (!album) continue;
    const key = discoveryKey(album);
    if (seen.has(key)) continue;
    seen.add(key); albums.push(album);
  }
  return { albums, next: index + 1 < pages ? index + 1 : null };
}
