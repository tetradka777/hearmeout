'use client';

import { useEffect, useState } from 'react';

// Artist photos for the avatars next to artist names, looked up by name.
// Names asked for within a moment of each other go to the server together
// (/api/deezer/artist-photos), and answers are kept in this browser for two
// weeks — artist photos are public, so not per account. A failed request
// isn't remembered: the next view asks again.
const STORE_KEY = 'hmo-artist-photos-v1';
const TTL_MS = 14 * 86400 * 1000;
const MAX_KEPT = 1500;
const BATCH = 40;

type Entry = [photo: string | null, at: number];
let store: Record<string, Entry> | null = null;
const pending = new Set<string>();
const inFlight = new Set<string>();
const listeners = new Map<string, Set<() => void>>();
let timer: ReturnType<typeof setTimeout> | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

const keyOf = (name: string) => name.trim().toLowerCase();

function load(): Record<string, Entry> {
  if (store) return store;
  try { store = JSON.parse(localStorage.getItem(STORE_KEY) || '{}') as Record<string, Entry>; } catch { store = {}; }
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
  const names = [...pending];
  pending.clear();
  for (let i = 0; i < names.length; i += BATCH) {
    const chunk = names.slice(i, i + BATCH);
    chunk.forEach((n) => inFlight.add(keyOf(n)));
    try {
      const res = await fetch('/api/deezer/artist-photos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ names: chunk }) });
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

function request(name: string) {
  const k = keyOf(name);
  if (!k || peekArtistPhoto(name) !== undefined || inFlight.has(k)) return;
  pending.add(name.trim());
  if (!timer) timer = setTimeout(flush, 40);
}

// The photo for `name`, asked for only once `enabled` (the avatar is on
// screen), so hidden screens and long lists don't fetch everything at once.
export function useArtistPhoto(name: string, enabled: boolean): string | null | undefined {
  const [photo, setPhoto] = useState<string | null | undefined>(() => peekArtistPhoto(name));
  useEffect(() => {
    const k = keyOf(name);
    setPhoto(peekArtistPhoto(name));
    const fn = () => setPhoto(peekArtistPhoto(name));
    const set = listeners.get(k) || new Set();
    set.add(fn);
    listeners.set(k, set);
    if (enabled) request(name);
    return () => { set.delete(fn); };
  }, [name, enabled]);
  return photo;
}
