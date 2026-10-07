import { supabaseAdmin } from './supabaseAdmin';

// Shared, durable cache for upstream API responses (Spotify, Deezer,
// Ticketmaster) in the spotify_cache table, read by every visitor, so N
// users looking at the same thing cost the upstream API one request instead
// of N. Three more ways it saves requests:
//   - the same key asked for at once (a page firing parallel requests, two
//     visitors on one artist) runs the fetcher once;
//   - an entry that expired less than staleMaxSeconds ago (3 days unless
//     the caller says otherwise) is answered right away and refreshed in
//     the background (the server is a long-lived Node process on Render,
//     so the refresh survives the response);
//   - a failed fetch (rate limit, outage) falls back to whatever's cached,
//     even if stale, rather than showing an error.
// staleMaxSeconds = 0 turns both fallbacks off, for data that goes bad
// (signed preview URLs).
const STALE_MAX_SECONDS = 3 * 86400;
const inflight = new Map<string, Promise<unknown>>();

async function refresh<T>(key: string, ttlSeconds: number, fetcher: () => Promise<T>): Promise<T> {
  const running = inflight.get(key);
  if (running) return running as Promise<T>;
  const p = (async () => {
    try {
      const fresh = await fetcher();
      const now = Date.now();
      await supabaseAdmin().from('spotify_cache').upsert({
        key,
        payload: fresh,
        fetched_at: new Date(now).toISOString(),
        expires_at: new Date(now + ttlSeconds * 1000).toISOString(),
      });
      return fresh;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
}

export async function withSpotifyCache<T>(key: string, ttlSeconds: number, fetcher: () => Promise<T>, staleMaxSeconds = STALE_MAX_SECONDS): Promise<T> {
  const { data: cached } = await supabaseAdmin()
    .from('spotify_cache')
    .select('payload, expires_at')
    .eq('key', key)
    .maybeSingle();

  const now = Date.now();
  if (cached) {
    const expires = new Date(cached.expires_at).getTime();
    if (expires > now) return cached.payload as T;
    if (now - expires < staleMaxSeconds * 1000) {
      refresh(key, ttlSeconds, fetcher).catch(() => {});
      return cached.payload as T;
    }
  }

  try {
    return await refresh(key, ttlSeconds, fetcher);
  } catch (err) {
    if (cached && staleMaxSeconds > 0) return cached.payload as T;
    throw err;
  }
}
