'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';

// Each page remembers how far down you were: going to another section and
// back (or Back in the browser) returns to the same place instead of the
// top. A page is a screen plus what it shows (this album, this friend), so
// a different album still opens at the top. The position is recorded while
// you scroll; when a page comes back it's restored, waiting a moment if
// its content is still too short to reach that far (and giving up as soon
// as you scroll yourself).
const positions = new Map<string, number>();
const WAIT_MS = 1500;

export function useScrollMemory(pageKey: string): void {
  const current = useRef(pageKey);
  const restoring = useRef(false);

  // The page being left: its position is read while it's still on screen
  // (this render runs before the switch is committed). Scroll events alone
  // aren't enough: they only fire when the browser draws a frame.
  const rendered = useRef(pageKey);
  // eslint-disable-next-line react-hooks/refs
  if (rendered.current !== pageKey) {
    // eslint-disable-next-line react-hooks/refs
    if (!restoring.current && typeof window !== 'undefined') positions.set(rendered.current, window.scrollY);
    // eslint-disable-next-line react-hooks/refs
    rendered.current = pageKey;
  }

  useEffect(() => {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    const onScroll = () => {
      if (!restoring.current) positions.set(current.current, window.scrollY);
    };
    const stopRestoring = () => { restoring.current = false; };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('wheel', stopRestoring, { passive: true });
    window.addEventListener('touchstart', stopRestoring, { passive: true });
    window.addEventListener('keydown', stopRestoring);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('wheel', stopRestoring);
      window.removeEventListener('touchstart', stopRestoring);
      window.removeEventListener('keydown', stopRestoring);
    };
  }, []);

  useLayoutEffect(() => {
    current.current = pageKey;
    const target = positions.get(pageKey) ?? 0;
    window.scrollTo(0, target);
    if (target === 0 || Math.abs(window.scrollY - target) < 2) { restoring.current = false; return; }
    // The page isn't tall enough yet (still loading): keep trying.
    restoring.current = true;
    const started = performance.now();
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      if (!restoring.current || current.current !== pageKey) return;
      window.scrollTo(0, target);
      if (Math.abs(window.scrollY - target) < 2 || performance.now() - started > WAIT_MS) {
        restoring.current = false;
        positions.set(pageKey, window.scrollY);
        return;
      }
      timer = setTimeout(tick, 50);
    };
    timer = setTimeout(tick, 50);
    return () => { clearTimeout(timer); restoring.current = false; };
  }, [pageKey]);
}
