import { supabaseAdmin } from './supabaseAdmin';
import { inBackground } from './spotifyPriority';

// Shared, durable cache for upstream API responses (Spotify, Deezer,
// Ticketmaster) in the spotify_cache table, read by every visitor, so N
// users looking at the same thing cost the upstream API one request instead
// of N. More ways it saves requests and time:
//   - recently used entries are also kept in this process's memory (the
//     server is one long-lived Node process on Render), so a hot key costs
//     no database round trip at all;
//   - the same key asked for at once (a page firing parallel requests, two
//     visitors on one artist) runs the fetcher once;
//   - an entry that expired less than staleMaxSeconds ago (30 days unless
//     the caller says otherwise) is answered right away and refreshed in
//     the background (the refresh survives the response);
//   - a failed fetch (rate limit, outage) falls back to whatever's cached,
//     even if stale, rather than showing an error.
// staleMaxSeconds = 0 turns both fallbacks off, for data that goes bad
// (signed preview URLs).
const STALE_MAX_SECONDS = 30 * 86400;
const inflight = new Map<string, Promise<unknown>>();

// The memory layer: insertion order doubles as recency (a hit is moved to
// the end), the oldest entries go past MEM_MAX.
type Entry = { payload: unknown; expires: number };
const MEM_MAX = 5000;
const mem = new Map<string, Entry>();

function memGet(key: string): Entry | undefined {
  const e = mem.get(key);
  if (e) { mem.delete(key); mem.set(key, e); }
  return e;
}

function memSet(key: string, e: Entry): void {
  mem.delete(key);
  mem.set(key, e);
  while (mem.size > MEM_MAX) mem.delete(mem.keys().next().value as string);
}

async function refresh<T>(key: string, ttlSeconds: number, fetcher: () => Promise<T>): Promise<T> {
  const running = inflight.get(key);
  if (running) return running as Promise<T>;
  const p = (async () => {
    try {
      const fresh = await fetcher();
      const now = Date.now();
      memSet(key, { payload: fresh, expires: now + ttlSeconds * 1000 });
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

async function read(key: string): Promise<Entry | null> {
  const hit = memGet(key);
  if (hit) return hit;
  const { data } = await supabaseAdmin().from('spotify_cache').select('payload, expires_at').eq('key', key).maybeSingle();
  if (!data) return null;
  const e = { payload: data.payload, expires: new Date(data.expires_at).getTime() };
  memSet(key, e);
  return e;
}

// Store a value directly (a job's own state, e.g. a history it appends to).
export async function storeSpotifyCache(key: string, payload: unknown, ttlSeconds: number): Promise<void> {
  const now = Date.now();
  memSet(key, { payload, expires: now + ttlSeconds * 1000 });
  await supabaseAdmin().from('spotify_cache').upsert({
    key, payload, fetched_at: new Date(now).toISOString(), expires_at: new Date(now + ttlSeconds * 1000).toISOString(),
  });
}

// Whatever is stored under key, however old, without fetching (null if
// nothing is) — for fallbacks while an upstream API is unavailable.
export async function peekSpotifyCache<T>(key: string): Promise<T | null> {
  const e = await read(key);
  return e ? (e.payload as T) : null;
}

// Many keys at once, however old: memory first, the rest in one database
// query. Only the keys found are in the result.
export async function peekSpotifyCacheMany<T>(keys: string[]): Promise<Map<string, { payload: T; fresh: boolean }>> {
  const out = new Map<string, { payload: T; fresh: boolean }>();
  const now = Date.now();
  const missing: string[] = [];
  for (const k of keys) {
    const e = memGet(k);
    if (e) out.set(k, { payload: e.payload as T, fresh: e.expires > now });
    else missing.push(k);
  }
  for (let i = 0; i < missing.length; i += 200) {
    const { data } = await supabaseAdmin().from('spotify_cache').select('key, payload, expires_at').in('key', missing.slice(i, i + 200));
    for (const row of data || []) {
      const e = { payload: row.payload, expires: new Date(row.expires_at).getTime() };
      memSet(row.key, e);
      out.set(row.key, { payload: e.payload as T, fresh: e.expires > now });
    }
  }
  return out;
}

export async function withSpotifyCache<T>(key: string, ttlSeconds: number, fetcher: () => Promise<T>, staleMaxSeconds = STALE_MAX_SECONDS): Promise<T> {
  const cached = await read(key);
  const now = Date.now();
  if (cached) {
    if (cached.expires > now) return cached.payload as T;
    if (now - cached.expires < staleMaxSeconds * 1000) {
      // Nobody waits for this one: background priority (lib/spotifyPriority).
      inBackground(() => refresh(key, ttlSeconds, fetcher)).catch(() => {});
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
