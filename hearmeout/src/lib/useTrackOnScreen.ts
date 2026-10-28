'use client';

import { useEffect, useState } from 'react';

// Whether a play control of the playing track (an element with data-pl =
// its trackKey, outside the bar itself) is on screen right now: then the
// bar isn't needed and stays hidden. Checked on scroll and resize, and
// twice a second for screen changes and content that loads in. The bottom
// 90px don't count — that's where the menu covers the page on a phone.
export function useTrackOnScreen(key: string | null): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!key) return;
    let frame = 0;
    const check = () => {
      frame = 0;
      const bottom = window.innerHeight - (window.innerWidth < 900 ? 90 : 0);
      let seen = false;
      for (const el of document.querySelectorAll<HTMLElement>('[data-pl]')) {
        if (el.dataset.pl !== key || el.closest('#plhost')) continue;
        const r = el.getBoundingClientRect();
        // Scrolled out of its own box (the album page's scroll area, a shelf).
        const box = el.closest('.asc23, .hrow')?.getBoundingClientRect();
        if (box && (r.bottom <= box.top || r.top >= box.bottom || r.right <= box.left || r.left >= box.right)) continue;
        // Zero size: inside a hidden screen or a closed panel.
        if (!r.width || !r.height) continue;
        if (r.bottom > 0 && r.top < bottom && r.right > 0 && r.left < window.innerWidth) { seen = true; break; }
      }
      setOn(seen);
    };
    const soon = () => { if (!frame) frame = requestAnimationFrame(check); };
    soon();
    const timer = setInterval(check, 500);
    window.addEventListener('scroll', soon, { capture: true, passive: true });
    window.addEventListener('resize', soon);
    return () => {
      clearInterval(timer);
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', soon, { capture: true });
      window.removeEventListener('resize', soon);
    };
  }, [key]);
  return !!key && on;
}
