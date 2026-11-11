export type CoverImageState = 'loading' | 'loaded' | 'failed';

type Options = { maxEntries?: number; failureRetryMs?: number; now?: () => number };
type Entry = { state: CoverImageState; at: number };

// Shared by covers on different screens. Keep results, not Image objects or
// decoded pixels: the browser still owns the picture's memory and HTTP cache.
// Failed URLs have a short pause so a missing cover cannot be requested by
// every copy of an album, but a temporary connection failure can recover.
export function createCoverImageCache(load: (url: string) => Promise<boolean>, options: Options = {}) {
  const entries = new Map<string, Entry>();
  const listeners = new Map<string, Set<() => void>>();
  const maxEntries = options.maxEntries ?? 4000;
  const failureRetryMs = options.failureRetryMs ?? 60_000;
  const now = options.now ?? Date.now;
  let settledEntries = 0;

  const readEntry = (url: string): Entry | undefined => {
    const entry = entries.get(url);
    if (entry) { entries.delete(url); entries.set(url, entry); }
    return entry;
  };
  const trim = () => {
    // Pending probes stay shared independently of the result budget. A
    // busy page cannot evict an image the moment it finishes loading.
    if (settledEntries <= maxEntries) return;
    for (const [url, entry] of entries) {
      if (settledEntries <= maxEntries) break;
      if (entry.state !== 'loading') { entries.delete(url); settledEntries--; }
    }
  };
  const ensure = (url: string, force = false) => {
    let entry = readEntry(url);
    if (entry?.state === 'loaded' || (entry?.state === 'failed' && !force && now() - entry.at < failureRetryMs)) return;
    if (!entry || entry.state === 'failed') {
      if (entry) settledEntries--;
      entry = { state: 'loading', at: now() };
      entries.set(url, entry);
      const loading = entry;
      const finish = (loaded: boolean) => {
        loading.state = loaded ? 'loaded' : 'failed';
        loading.at = now();
        settledEntries++;
        entries.delete(url);
        entries.set(url, loading);
        trim();
        listeners.get(url)?.forEach((listener) => listener());
      };
      load(url).then(finish, () => finish(false));
    }
  };
  return {
    retry(url: string, force = false): void {
      if (readEntry(url)?.state === 'failed') ensure(url, force);
    },
    read: (url: string): CoverImageState | undefined => readEntry(url)?.state,
    watch(url: string, changed: () => void): () => void {
      const watching = listeners.get(url) ?? new Set<() => void>();
      watching.add(changed);
      listeners.set(url, watching);
      const stop = () => {
        watching.delete(changed);
        if (!watching.size) listeners.delete(url);
      };
      ensure(url);
      return stop;
    },
  };
}

function probeImage(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const image = new window.Image();
    const finish = (loaded: boolean) => {
      image.onload = null;
      image.onerror = null;
      resolve(loaded);
    };
    image.onload = () => finish(true);
    image.onerror = () => finish(false);
    image.src = url;
  });
}

export const coverImages = createCoverImageCache(probeImage);
