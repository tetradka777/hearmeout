'use client';

import { useEffect, useState } from 'react';

// Artist photos for the avatars next to artist names. Looked up by Spotify
// artist id when it's known, else by name — and kept under that same key,
// so a photo found for a name is never reused for a same-named artist whose
// id is known (that showed the wrong face on some cards). Lookups asked
// for within a moment of each other go to the server together
// (/api/deezer/artist-photos), and answers are kept in this browser for two
// weeks — artist photos are public, so not per account. A failed request
// isn't remembered: the next view asks again.
const STORE_KEY = 'hmo-artist-photos-v5';
const TTL_MS = 14 * 86400 * 1000;
const MAX_KEPT = 2000;
const BATCH = 40;

type Entry = [photo: string | null, at: number];
let store: Record<string, Entry> | null = null;
const pending = new Map<string, { name: string; id: string | null }>(); // key -> what to look up
const inFlight = new Set<string>();
const listeners = new Map<string, Set<() => void>>();
let timer: ReturnType<typeof setTimeout> | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

const keyOf = (name: string, id?: string | null) => (id ? `#${id}` : name.trim().toLowerCase());

function load(): Record<string, Entry> {
  if (store) return store;
  try {
    store = JSON.parse(localStorage.getItem(STORE_KEY) || '{}') as Record<string, Entry>;
    // Older stores were keyed by name only.
    for (const old of ['hmo-artist-photos-v1', 'hmo-artist-photos-v2', 'hmo-artist-photos-v3', 'hmo-artist-photos-v4']) localStorage.removeItem(old);
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
export function peekArtistPhoto(name: string, id?: string | null): string | null | undefined {
  const hit = load()[keyOf(name, id)];
  if (!hit || Date.now() - hit[1] > TTL_MS) return undefined;
  return hit[0];
}

async function flush() {
  timer = null;
  const queued = [...pending.entries()];
  pending.clear();
  for (let i = 0; i < queued.length; i += BATCH) {
    const chunk = queued.slice(i, i + BATCH);
    chunk.forEach(([k]) => inFlight.add(k));
    try {
      // The server answers by the same key: the id when sent, else the name.
      const items = chunk.map(([, it]) => it);
      const res = await fetch('/api/deezer/artist-photos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items }) });
      if (res.ok) {
        const { photos } = await res.json() as { photos: Record<string, string | null> };
        const s = load();
        for (const [k, it] of chunk) {
          const answer = it.id ? photos[it.id] : photos[it.name];
          if (answer !== undefined) s[k] = [answer, Date.now()];
        }
        save();
      }
    } catch {
      // Offline or the server failed: shown as a letter until next time.
    } finally {
      for (const [k] of chunk) {
        inFlight.delete(k);
        listeners.get(k)?.forEach((fn) => fn());
      }
    }
  }
}

function request(name: string, id?: string | null) {
  const k = keyOf(name, id);
  if (!name.trim() || peekArtistPhoto(name, id) !== undefined || inFlight.has(k) || pending.has(k)) return;
  pending.set(k, { name: name.trim(), id: id ?? null });
  if (!timer) timer = setTimeout(flush, 40);
}

// The photo for this artist, asked for only once `enabled` (the avatar is
// on screen), so hidden screens and long lists don't fetch everything at once.
export function useArtistPhoto(name: string, enabled: boolean, id?: string | null): string | null | undefined {
  const [photo, setPhoto] = useState<string | null | undefined>(() => peekArtistPhoto(name, id));
  useEffect(() => {
    const k = keyOf(name, id);
    setPhoto(peekArtistPhoto(name, id));
    const fn = () => setPhoto(peekArtistPhoto(name, id));
    const set = listeners.get(k) || new Set();
    set.add(fn);
    listeners.set(k, set);
    if (enabled) request(name, id);
    return () => { set.delete(fn); };
  }, [name, enabled, id]);
  return photo;
}
