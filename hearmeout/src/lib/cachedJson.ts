'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

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
// Inline profile photos/banner can exceed the ordinary response limit.
// Keep the bootstrap within the same total device-storage budget.
const MAX_BOOTSTRAP_CHARS = 2_000_000;
const MAX_STORE_CHARS = 3_000_000;

type Entry = { at: number; data: unknown };
type ReadOptions = { force?: boolean; sensitive?: boolean; maxAgeMs?: number };
const isDiaryUrl = (url: string) => /^\/api\/diary(?:\?|$)/.test(url);
const isPrivateMusicUrl = (url: string) => isDiaryUrl(url) || /^\/api\/album-swaps(?:\?|$)/.test(url);
const mem = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();
const listeners = new Map<string, Set<(data: unknown) => void>>();
let owner: string | null = null;
let generation = 0;
const ownerListeners = new Set<() => void>();
const subscribeOwner = (fn: () => void) => { ownerListeners.add(fn); return () => { ownerListeners.delete(fn); }; };
const ownerVersion = () => generation;
const serverOwnerVersion = () => 0;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let saveIdle: number | null = null;

function storage(): Storage | null {
  try { return typeof window === 'undefined' ? null : window.localStorage; } catch { return null; }
}

// Whose answers these are: set when the account is known, null on sign-out
// (which forgets everything, in memory and stored).
export function setJsonCacheOwner(userId: string | null): void {
  if (userId === owner) return;
  generation++;
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  if (saveIdle != null) { window.cancelIdleCallback(saveIdle); saveIdle = null; }
  mem.clear();
  inflight.clear();
  owner = userId;
  const ls = storage();
  if (!ls) { ownerListeners.forEach(fn => fn()); return; }
  try {
    if (userId) ls.setItem(OWNER_KEY, userId); else ls.removeItem(OWNER_KEY);
    for (let i = ls.length - 1; i >= 0; i--) {
      const k = ls.key(i);
      if (k?.startsWith(STORE_PREFIX) && k !== STORE_PREFIX + userId) ls.removeItem(k);
    }
    if (!userId) return;
    const raw = ls.getItem(STORE_PREFIX + userId);
    const saved = raw ? (JSON.parse(raw) as Record<string, Entry>) : {};
    let removedPrivate = false;
    for (const [url, e] of Object.entries(saved)) {
      if (isPrivateMusicUrl(url)) { delete saved[url]; removedPrivate = true; }
      else mem.set(url, e);
    }
    if (removedPrivate) ls.setItem(STORE_PREFIX + userId, JSON.stringify(saved));
  } catch {
    // Unreadable store: start empty.
  } finally { ownerListeners.forEach(fn => fn()); }
}

function scheduleSave(): void {
  if (saveTimer || saveIdle != null || !owner) return;
  const scheduledGeneration = generation;
  const save = () => {
    saveIdle = null;
    if (generation !== scheduledGeneration) return;
    const ls = storage();
    if (!ls || !owner) return;
    // Newest first, until the size budget runs out.
    const out: string[] = [];
    let size = 2;
    for (const [url, e] of [...mem.entries()].sort((a, b) => Number(b[0] === '/api/me') - Number(a[0] === '/api/me') || b[1].at - a[1].at)) {
      if (isPrivateMusicUrl(url)) continue;
      const serialized = JSON.stringify(e);
      const item = `${JSON.stringify(url)}:${serialized}`;
      const cost = item.length + (out.length ? 1 : 0);
      if (serialized.length > (url === '/api/me' ? MAX_BOOTSTRAP_CHARS : MAX_ENTRY_CHARS) || size + cost > MAX_STORE_CHARS) continue;
      out.push(item);
      size += cost;
    }
    try { ls.setItem(STORE_PREFIX + owner, `{${out.join(',')}}`); } catch { /* full or blocked */ }
  };
  saveTimer = setTimeout(() => {
    saveTimer = null;
    // Serialization and synchronous storage must yield to scrolling and taps.
    // The timeout still saves during a busy page; Safari has the timer fallback.
    if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
      saveIdle = window.requestIdleCallback(save, { timeout: 2000 });
    } else save();
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
  // A page requested before diary CRUD must not become a fresh cache hit
  // after that mutation, even if its mounted caller ignores the old result.
  for (const url of [...inflight.keys()]) if (isPrivateMusicUrl(url) && url.startsWith(prefix)) inflight.delete(url);
}

function evictDenied(url: string): void {
  // Losing access on a later diary page also revokes the already displayed
  // first page. Cancel pending siblings so an older response cannot restore it.
  const diaryUser = isDiaryUrl(url) ? new URL(url, 'http://cache.local').searchParams.get('userId') : null;
  const keys = new Set([...mem.keys(), ...inflight.keys(), ...listeners.keys(), url]);
  for (const key of keys) {
    if (key !== url && !(diaryUser && isDiaryUrl(key) && new URL(key, 'http://cache.local').searchParams.get('userId') === diaryUser)) continue;
    mem.delete(key);
    inflight.delete(key);
    listeners.get(key)?.forEach((fn) => fn(null));
  }
  scheduleSave();
}

// The answer: the copy if it's fresh (or `force` is off and a request is
// already out), otherwise a new request. Resolves to null on failure when
// there's no copy at all.
export function cachedJson<T>(url: string, opts: ReadOptions = {}): Promise<T | null> {
  const hit = mem.get(url);
  if (!opts.force && !opts.sensitive && hit && hit.at > 0 && Date.now() - hit.at < (opts.maxAgeMs ?? FRESH_MS)) return Promise.resolve(hit.data as T);
  const pending = inflight.get(url);
  if (pending && !opts.force) return pending as Promise<T | null>;
  const requestGeneration = generation;
  let denied = false;
  const p = fetch(url)
    .then((r) => { denied = r.status === 401 || r.status === 403; return r.ok ? (r.json() as Promise<T>) : null; })
    .catch(() => null)
    .then((v) => {
      // An answer started by a different account must neither repopulate
      // this account's store nor reach a still-mounted caller.
      if (requestGeneration !== generation) return null;
      // A forced refresh can finish first. An older answer must not
      // overwrite it or remove the request newer callers are sharing.
      if (inflight.get(url) !== p) return opts.sensitive ? null : (mem.get(url)?.data as T | undefined) ?? null;
      inflight.delete(url);
      if (opts.sensitive && denied) {
        evictDenied(url);
        return null;
      }
      if (v == null) return opts.sensitive ? null : (mem.get(url)?.data as T | undefined) ?? null;
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
export function useCachedJson<T>(url: string | null, opts: { sensitive?: boolean; maxAgeMs?: number } = {}): { data: T | null; failed: boolean; reload: () => Promise<T | null> } {
  const sensitive = !!opts.sensitive;
  const maxAgeMs = opts.maxAgeMs;
  const version = useSyncExternalStore(subscribeOwner, ownerVersion, serverOwnerVersion);
  type View = { url: string | null; version: number; data: T | null; confirmed: boolean; failed: boolean };
  const [view, setView] = useState<View>(() => ({ url, version, data: url && !sensitive ? peekJson<T>(url) : null, confirmed: false, failed: false }));
  useEffect(() => {
    let active = true;
    setView({ url, version, data: url && !sensitive ? peekJson<T>(url) : null, confirmed: false, failed: false });
    if (!url) return;
    const receive = (d: unknown) => { if (active) setView({ url, version, data: d as T | null, confirmed: d != null, failed: d == null }); };
    const set = listeners.get(url) || new Set(); set.add(receive); listeners.set(url, set);
    void cachedJson<T>(url, { sensitive, force: sensitive, maxAgeMs }).then(receive);
    return () => { active = false; set.delete(receive); if (!set.size) listeners.delete(url); };
  }, [url, sensitive, version, maxAgeMs]);
  const reload = useCallback(async () => {
    if (!url) return null;
    setView(previous => previous.url === url && previous.version === version ? { ...previous, failed: false } : previous);
    const data = await cachedJson<T>(url, { force: true, sensitive, maxAgeMs });
    setView(previous => previous.url === url && previous.version === version ? { url, version, data, confirmed: data != null, failed: data == null } : previous);
    return data;
  }, [url, sensitive, version, maxAgeMs]);
  // A changed URL/account must never render the previous resource, even for
  // the commit before its effect runs (which could expose stale action ids).
  const current = view.url === url && view.version === version;
  return { data: current ? (sensitive && !view.confirmed ? null : view.data) : url && !sensitive ? peekJson<T>(url) : null, failed: current && view.failed, reload };
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
    if ((jsonAge(url) ?? Infinity) > PAGE_REFRESH_MS) void cachedJson(url);
    return hit;
  }
  const v = await cachedJson<T>(url);
  if (v == null) throw new Error('page_failed');
  return v;
}
