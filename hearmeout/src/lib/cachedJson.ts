// GET a JSON API route once for everyone who asks within a short window.
// Every screen stays mounted, so at start-up Home, Match, the friend page and
// the group screens all asked for the same friend profiles and 6-month
// stats at once — each friend's profile went out several times and the free
// server slowed to a crawl. Same URL at the same time → one request; the
// answer is reused for TTL_MS. A failed or non-OK answer resolves to null
// and isn't kept.
const TTL_MS = 30000;
const cache = new Map<string, { at: number; promise: Promise<unknown> }>();

export function cachedJson<T>(url: string): Promise<T | null> {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.promise as Promise<T | null>;
  const promise = fetch(url)
    .then((r) => (r.ok ? (r.json() as Promise<T>) : null))
    .catch(() => null)
    .then((v) => { if (v == null) cache.delete(url); return v; });
  cache.set(url, { at: Date.now(), promise });
  return promise;
}
