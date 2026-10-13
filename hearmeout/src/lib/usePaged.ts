'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type Page<T, C> = { items: T[]; next: C | null };

// An endless list loaded a page at a time: the first page on mount (and
// again whenever `deps` change), each next one when `more()` is called —
// a shelf calls it when its end scrolls into view. Pages keep coming until
// at least `min` items are in (a page can come back short after filtering)
// or the source runs out. `keyOf` drops items already in the list.
export function usePaged<T, C>(
  load: (cursor: C | null) => Promise<Page<T, C>>,
  keyOf: (item: T) => string,
  deps: unknown[],
  min = 0,
) {
  // Keyed by deps: new deps start an empty list (reset while rendering,
  // not in an effect, so the old list never shows under the new deps).
  const key = JSON.stringify(deps);
  const [view, setView] = useState({ key, items: [] as T[], done: false, failed: false });
  if (view.key !== key) setView({ key, items: [], done: false, failed: false });
  const state = useRef({ cursor: null as C | null, busy: false, keys: new Set<string>(), count: 0, done: false });
  const loadRef = useRef(load);
  const keyRef = useRef(keyOf);
  useEffect(() => { loadRef.current = load; keyRef.current = keyOf; });

  const more = useCallback(async () => {
    const s = state.current;
    if (s.busy || s.done) return;
    s.busy = true;
    // A reset (new deps, or a second effect run) swaps in a new state object;
    // a load still running for the old one then stops.
    const stale = () => state.current !== s;
    try {
      // Keep going while pages come back empty after de-duplication, or the
      // list is still under `min`.
      for (let i = 0; i < 12; i++) {
        const page = await loadRef.current(s.cursor);
        if (stale()) return;
        const fresh = page.items.filter((it) => {
          const k = keyRef.current(it);
          if (s.keys.has(k)) return false;
          s.keys.add(k);
          return true;
        });
        s.cursor = page.next;
        s.count += fresh.length;
        if (fresh.length) setView((v) => ({ ...v, items: [...v.items, ...fresh] }));
        if (page.next === null) { s.done = true; setView((v) => ({ ...v, done: true })); break; }
        if (fresh.length && s.count >= min) break;
      }
    } catch {
      if (!stale()) setView((v) => ({ ...v, failed: true }));
    } finally {
      s.busy = false;
    }
  }, [min]);

  useEffect(() => {
    state.current = { cursor: null, busy: false, keys: new Set(), count: 0, done: false };
    more();
  }, [key, more]);

  const current = view.key === key ? view : { items: [] as T[], done: false, failed: false };
  return { items: current.items, done: current.done, failed: current.failed, more };
}
