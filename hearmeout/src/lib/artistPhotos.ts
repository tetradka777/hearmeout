'use client';

import { useEffect, useState } from 'react';

// Artist photos for the avatars next to artist names, looked up by name.
// Names asked for within a moment of each other go to the server together
// (/api/deezer/artist-photos), and answers are kept in this browser for two
// weeks — artist photos are public, so not per account. A failed request
// isn't remembered: the next view asks again.
const STORE_KEY = 'hmo-artist-photos-v3';
const TTL_MS = 14 * 86400 * 1000;
const MAX_KEPT = 1500;
const BATCH = 40;

type Entry = [photo: string | null, at: number];
let store: Record<string, Entry> | null = null;
const pending = new Map<string, string | null>(); // name -> Spotify artist id, if known
const inFlight = new Set<string>();
const listeners = new Map<string, Set<() => void>>();
let timer: ReturnType<typeof setTimeout> | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

const keyOf = (name: string) => name.trim().toLowerCase();

function load(): Record<string, Entry> {
  if (store) return store;
  try {
    store = JSON.parse(localStorage.getItem(STORE_KEY) || '{}') as Record<string, Entry>;
    // Older stores picked similarly named artists' photos at times.
    localStorage.removeItem('hmo-artist-photos-v1');
    localStorage.removeItem('hmo-artist-photos-v2');
  } catch { store = {}; }
  return store!;
}

function save() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const s = load();
    const entries = Object.entries(s);
    if (entries.length > MAX_KEPT) {
      entries.sort((a, b) => b[1][1] - a[1][1]);
      store = Object.fromEntries(entries.slice(0, MAX_KEPT));
    }
    try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch { /* storage full or blocked */ }
  }, 500);
}

// undefined: not known yet; null: the artist has no photo.
export function peekArtistPhoto(name: string): string | null | undefined {
  const hit = load()[keyOf(name)];
  if (!hit || Date.now() - hit[1] > TTL_MS) return undefined;
  return hit[0];
}

async function flush() {
  timer = null;
  const queued = [...pending].map(([name, id]) => ({ name, id }));
  pending.clear();
  for (let i = 0; i < queued.length; i += BATCH) {
    const items = queued.slice(i, i + BATCH);
    const chunk = items.map((it) => it.name);
    chunk.forEach((n) => inFlight.add(keyOf(n)));
    try {
      const res = await fetch('/api/deezer/artist-photos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items }) });
      if (res.ok) {
        const { photos } = await res.json() as { photos: Record<string, string | null> };
        const s = load();
        for (const n of chunk) if (n in photos) s[keyOf(n)] = [photos[n], Date.now()];
        save();
      }
    } catch {
      // Offline or the server failed: shown as a letter until next time.
    } finally {
      for (const n of chunk) {
        inFlight.delete(keyOf(n));
        listeners.get(keyOf(n))?.forEach((fn) => fn());
      }
    }
  }
}

function request(name: string, id?: string | null) {
  const k = keyOf(name);
  if (!k || peekArtistPhoto(name) !== undefined || inFlight.has(k)) return;
  pending.set(name.trim(), id ?? pending.get(name.trim()) ?? null);
  if (!timer) timer = setTimeout(flush, 40);
}

// The photo for `name`, asked for only once `enabled` (the avatar is on
// screen), so hidden screens and long lists don't fetch everything at once.
export function useArtistPhoto(name: string, enabled: boolean, id?: string | null): string | null | undefined {
  const [photo, setPhoto] = useState<string | null | undefined>(() => peekArtistPhoto(name));
  useEffect(() => {
    const k = keyOf(name);
    setPhoto(peekArtistPhoto(name));
    const fn = () => setPhoto(peekArtistPhoto(name));
    const set = listeners.get(k) || new Set();
    set.add(fn);
    listeners.set(k, set);
    if (enabled) request(name, id);
    return () => { set.delete(fn); };
  }, [name, enabled, id]);
  return photo;
}
