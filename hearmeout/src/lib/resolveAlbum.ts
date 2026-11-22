// Resolve only on demand. Concurrent taps share one request; temporary failures
// respect a cooldown instead of spending Spotify quota again on every tap.
type Result = { id: string; error?: never } | { id?: never; error: 'not_found' | 'unavailable' };
const pending = new Map<string, Promise<Result>>();
const saved = new Map<string, { until: number; result: Result }>();
export function resolveAlbum(title: string, artist: string, artistId?: string): Promise<Result> {
  const query = new URLSearchParams({ title, artist });
  if (artistId) query.set('artistId', artistId);
  const url = '/api/spotify/resolve-album?' + query;
  const hit = saved.get(url);
  if (hit && hit.until > Date.now()) return Promise.resolve(hit.result);
  const running = pending.get(url);
  if (running) return running;
  const request = (async (): Promise<Result> => {
    let result: Result = { error: 'unavailable' }, ttl = 10000;
    try {
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        if (typeof data.id === 'string' && /^[a-zA-Z0-9]{22}$/.test(data.id)) { result = { id: data.id }; ttl = 86400000; }
      } else if (response.status === 404) { result = { error: 'not_found' }; ttl = 60000; }
      else {
        const retry = Number(response.headers.get('Retry-After'));
        if (Number.isFinite(retry) && retry > 0) ttl = Math.min(retry * 1000, 3600000);
      }
    } catch { /* Preserve the distinction between an outage and a missing album. */ }
    saved.delete(url);
    saved.set(url, { until: Date.now() + ttl, result });
    while (saved.size > 200) saved.delete(saved.keys().next().value!);
    return result;
  })().finally(() => pending.delete(url));
  pending.set(url, request);
  return request;
}
