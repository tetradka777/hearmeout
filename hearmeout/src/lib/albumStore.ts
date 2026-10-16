'use client';

import type { Album } from './types';

// Albums fetched live (outside the static catalog) kept in the browser
// between visits: an album's title, cover and tracklist practically never
// change, so a returning visitor sees covers at once and the server (and
// Spotify) isn't asked again. Album data is public, so the store isn't per
// account. The most recently used MAX_ALBUMS are kept.
const KEY = 'hmo-albums-v1';
const MAX_ALBUMS = 400;

type Stored = Record<string, { at: number; album: Album }>;
let cache: Stored | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function storage(): Storage | null {
  try { return typeof window === 'undefined' ? null : window.localStorage; } catch { return null; }
}

function load(): Stored {
  if (cache) return cache;
  try {
    const raw = storage()?.getItem(KEY);
    cache = raw ? (JSON.parse(raw) as Stored) : {};
  } catch {
    cache = {};
  }
  return cache;
}

export function storedAlbums(): Record<string, Album> {
  return Object.fromEntries(Object.entries(load()).map(([id, e]) => [id, e.album]));
}

export function storeAlbums(albums: Record<string, Album>): void {
  const all = load();
  const now = Date.now();
  for (const [id, album] of Object.entries(albums)) all[id] = { at: now, album };
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const kept = Object.entries(load()).sort((a, b) => b[1].at - a[1].at).slice(0, MAX_ALBUMS);
    cache = Object.fromEntries(kept);
    try { storage()?.setItem(KEY, JSON.stringify(cache)); } catch { /* full or blocked */ }
  }, 2000);
}
