import { AsyncLocalStorage } from 'node:async_hooks';

// Spotify's quota is shared by the whole app, and running over it blocks
// every Spotify call for hours (Retry-After of 6–7 hours has happened). So
// work nobody is waiting for — release checks, the news strip, filling in
// history covers, refreshing stale cache entries — runs "in the background"
// and gets only a small part of the request budget (spotifyCatalog's
// pacing), leaving the rest to pages people have open.
const store = new AsyncLocalStorage<'background'>();

export function inBackground<T>(fn: () => Promise<T>): Promise<T> {
  return store.run('background', fn);
}

export function isBackground(): boolean {
  return store.getStore() === 'background';
}
