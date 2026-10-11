import type { StatsData } from './types';

// Stats answers kept in the browser for the session, by query string, so
// going back to a period shows it at once (it used to blank and reload on
// every switch). An entry older than FRESH_MS is shown but refreshed in the
// background. A sync clears it, since the numbers change.
const FRESH_MS = 60 * 1000;
const cache = new Map<string, { at: number; data: StatsData }>();

export function cachedStats(key: string): { data: StatsData; fresh: boolean } | null {
  const hit = cache.get(key);
  return hit ? { data: hit.data, fresh: Date.now() - hit.at < FRESH_MS } : null;
}

export function storeStats(key: string, data: StatsData): void {
  cache.set(key, { at: Date.now(), data });
}

export function clearStatsCache(): void {
  cache.clear();
}
