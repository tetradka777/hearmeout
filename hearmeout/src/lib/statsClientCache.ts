import type { StatsData } from './types';
import { invalidateJson, jsonAge, peekJson, storeJson } from './cachedJson';

// Stats answers by query string, kept in the shared browser cache
// (lib/cachedJson) so going back to a period shows it at once, and so does
// a reload or a period the preloader already fetched. An entry older than
// FRESH_MS is shown but refreshed in the background. A sync clears it,
// since the numbers change.
const FRESH_MS = 60 * 1000;
const url = (key: string) => `/api/stats?${key}`;

export function cachedStats(key: string): { data: StatsData; fresh: boolean } | null {
  const data = peekJson<StatsData>(url(key));
  if (!data) return null;
  const age = jsonAge(url(key));
  return { data, fresh: age != null && age < FRESH_MS };
}

export function storeStats(key: string, data: StatsData): void {
  storeJson(url(key), data);
}

export function clearStatsCache(): void {
  invalidateJson('/api/stats');
}
