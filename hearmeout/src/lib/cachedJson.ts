'use client';

import { useCallback, useEffect, useState } from 'react';

// The browser's copy of GET API answers (stale-while-revalidate). Any screen
// shows the last known answer at once and refreshes it in the background,
// so nothing waits for its own request when you open it: the background
// preloader (useBackgroundPreload) has usually fetched it already, and the
// copy survives a reload (localStorage, per account) so even a fresh visit
// opens with data. The same URL asked by several screens at once is one
// request. A failed or non-OK answer keeps the old copy.
const FRESH_MS = 30000;
const STORE_PREFIX = 'hmo-json-v1:';
const OWNER_KEY = 'hmo-json-owner';
const MAX_ENTRY_CHARS = 400_000;
const MAX_STORE_CHARS = 3_000_000;

type Entry = { at: number; data: unknown };
const mem = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();
const listeners = new Map<string, Set<(data: unknown) => void>>();
let owner: string | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function storage(): Storage | null {
  try { return typeof window === 'undefined' ? null : window.localStorage; } catch { return null; }
}

// Whose answers these are: set when the account is known, null on sign-out
// (which forgets everything, in memory and stored).
export function setJsonCacheOwner(userId: string | null): void {
  if (userId === owner) return;
  mem.clear();
  inflight.clear();
  owner = userId;
  const ls = storage();
  if (!ls) return;
  try {
    if (userId) ls.setItem(OWNER_KEY, userId); else ls.removeItem(OWNER_KEY);
    for (let i = ls.length - 1; i >= 0; i--) {
      const k = ls.key(i);
      if (k?.startsWith(STORE_PREFIX) && k !== STORE_PREFIX + userId) ls.removeItem(k);
    }
    if (!userId) return;
    const raw = ls.getItem(STORE_PREFIX + userId);
    const saved = raw ? (JSON.parse(raw) as Record<string, Entry>) : {};
    for (const [url, e] of Object.entries(saved)) mem.set(url, e);
  } catch {
    // Unreadable store: start empty.
  }
}

function scheduleSave(): void {
  if (saveTimer || !owner) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const ls = storage();
    if (!ls || !owner) return;
    // Newest first, until the size budget runs out.
    const out: Record<string, Entry> = {};
    let size = 0;
    for (const [url, e] of [...mem.entries()].sort((a, b) => b[1].at - a[1].at)) {
      const s = JSON.stringify(e).length;
      if (s > MAX_ENTRY_CHARS || size + s > MAX_STORE_CHARS) continue;
      out[url] = e;
      size += s;
    }
    try { ls.setItem(STORE_PREFIX + owner, JSON.stringify(out)); } catch { /* full or blocked */ }
  }, 1500);
}

export function peekJson<T>(url: string): T | null {
  return (mem.get(url)?.data as T | undefined) ?? null;
}

// How old the stored copy is (ms), or null without one.
export function jsonAge(url: string): number | null {
  const e = mem.get(url);
  return e ? Date.now() - e.at : null;
}

export function storeJson(url: string, data: unknown): void {
  mem.set(url, { at: Date.now(), data });
  listeners.get(url)?.forEach((fn) => fn(data));
  scheduleSave();
}

// Forget answers whose URL starts with this (after a change on the server).
export function invalidateJson(prefix: string): void {
  for (const url of [...mem.keys()]) if (url.startsWith(prefix)) mem.set(url, { ...mem.get(url)!, at: 0 });
}

// The answer: the copy if it's fresh (or `force` is off and a request is
// already out), otherwise a new request. Resolves to null on failure when
// there's no copy at all.
export function cachedJson<T>(url: string, opts: { force?: boolean } = {}): Promise<T | null> {
  const hit = mem.get(url);
  if (!opts.force && hit && Date.now() - hit.at < FRESH_MS) return Promise.resolve(hit.data as T);
  const pending = inflight.get(url);
  if (pending && !opts.force) return pending as Promise<T | null>;
  const p = fetch(url)
    .then((r) => (r.ok ? (r.json() as Promise<T>) : null))
    .catch(() => null)
    .then((v) => {
      inflight.delete(url);
      if (v == null) return (mem.get(url)?.data as T | undefined) ?? null;
      storeJson(url, v);
      return v;
    });
  inflight.set(url, p);
  return p;
}

// Warm the cache without waiting.
export function prefetchJson(url: string): Promise<unknown> {
  return cachedJson(url);
}

// A screen's view of one URL: the stored copy right away, then the fresh
// answer (and any later refresh another screen triggers). `reload` forces a
// new request, e.g. after the user changed something. `failed`: the request
// failed and there's no copy to show.
export function useCachedJson<T>(url: string | null): { data: T | null; failed: boolean; reload: () => Promise<T | null> } {
  const [data, setData] = useState<T | null>(() => (url ? peekJson<T>(url) : null));
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
    if (!url) { setData(null); return; }
    setData(peekJson<T>(url));
    const fn = (d: unknown) => setData(d as T);
    const set = listeners.get(url) || new Set();
    set.add(fn);
    listeners.set(url, set);
    cachedJson<T>(url).then((d) => { if (d != null) setData(d); else setFailed(true); });
    return () => { set.delete(fn); };
  }, [url]);
  const reload = useCallback(() => (url ? cachedJson<T>(url, { force: true }) : Promise.resolve(null)), [url]);
  return { data, failed, reload };
}

// The last account's copy is loaded as soon as this module runs in the
// browser, before any screen renders, so the first paint already has data.
// (AppContext confirms the account with /api/me and switches or clears it.)
if (typeof window !== 'undefined') {
  try {
    const last = window.localStorage.getItem(OWNER_KEY);
    if (last) setJsonCacheOwner(last);
  } catch {
    // Storage blocked: everything just loads over the network.
  }
}

// One page of an endless shelf: the stored copy at once (however old, so a
// shelf seen before fills in instantly, even after a reload), refreshed in
// the background when older than an hour; otherwise the request. Throws when
// there's nothing to show, like a failed fetch.
const PAGE_REFRESH_MS = 3600 * 1000;
export async function cachedPage<T>(url: string): Promise<T> {
  const hit = peekJson<T>(url);
  if (hit != null) {
    if ((jsonAge(url) ?? Infinity) > PAGE_REFRESH_MS) void cachedJson(url, { force: true });
    return hit;
  }
  const v = await cachedJson<T>(url);
  if (v == null) throw new Error('page_failed');
  return v;
}
