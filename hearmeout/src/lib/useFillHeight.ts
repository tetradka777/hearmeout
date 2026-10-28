'use client';

import { useEffect, useState, type RefObject } from 'react';

const MIN = 160;  // px left for the scroll area, below that the page scrolls as usual
const GAP = 10;   // px between the scroll area and the menu / player below it

// A part of a page that scrolls on its own while everything above it stays
// put (the album page below its rate | tracklist switch): the element gets
// the height from where it starts down to the bottom menu (or the preview
// bar on a computer), and the page itself stops scrolling (html.lk23).
// Re-measured when the window, the content above, or the menu change size.
// Returns whether it's on — on a screen too short for it, it isn't.
export function useFillHeight(ref: RefObject<HTMLElement | null>, active: boolean): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!active || !el) return;
    const root = document.documentElement;
    window.scrollTo(0, 0);
    let frame = 0;
    const measure = () => {
      frame = 0;
      const dock = document.querySelector<HTMLElement>('.dock24');
      const bar = document.querySelector<HTMLElement>('#plhost.on');
      let bottom = window.innerHeight;
      const dockTop = dock && getComputedStyle(dock).display !== 'contents' ? dock.getBoundingClientRect().top : null;
      if (dockTop != null && dockTop > 0) bottom = dockTop;
      else if (bar) bottom = bar.getBoundingClientRect().top;
      const top = el.getBoundingClientRect().top + window.scrollY;
      const h = Math.floor(bottom - GAP - top);
      const fits = h >= MIN;
      el.style.height = fits ? `${h}px` : '';
      root.classList.toggle('lk23', fits);
      setOn(fits);
    };
    const soon = () => { if (!frame) frame = requestAnimationFrame(measure); };
    soon();
    const ro = new ResizeObserver(soon);
    const above = el.parentElement;
    if (above) ro.observe(above);
    const dock = document.querySelector('.dock24');
    if (dock) ro.observe(dock);
    window.addEventListener('resize', soon);
    // The preview bar on a computer comes and goes without resizing anything.
    const timer = setInterval(soon, 1000);
    return () => {
      ro.disconnect();
      clearInterval(timer);
      window.removeEventListener('resize', soon);
      if (frame) cancelAnimationFrame(frame);
      el.style.height = '';
      root.classList.remove('lk23');
      setOn(false);
    };
  }, [ref, active]);
  return on;
}
