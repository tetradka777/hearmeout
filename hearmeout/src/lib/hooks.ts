'use client';

import { useEffect, useState } from 'react';
import { fetchDeezerArtistPhoto } from './deezer';

export function useDeezerArtistPhoto(name: string | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    setUrl(null);
    if (!name) return;
    let cancelled = false;
    fetchDeezerArtistPhoto(name).then((u) => { if (!cancelled) setUrl(u); });
    return () => { cancelled = true; };
  }, [name]);
  return url;
}

// Scrollbars are hidden site-wide, so a mouse wheel over a horizontal row
// scrolls the row sideways (until its end, then the page scrolls as usual).
export function useWheelRows() {
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      const row = (e.target as Element | null)?.closest?.('.hrow, .stabs');
      if (!(row instanceof HTMLElement) || row.scrollWidth <= row.clientWidth) return;
      const max = row.scrollWidth - row.clientWidth;
      if ((e.deltaY < 0 && row.scrollLeft <= 0) || (e.deltaY > 0 && row.scrollLeft >= max - 1)) return;
      e.preventDefault();
      row.scrollLeft += e.deltaY;
    };
    window.addEventListener('wheel', onWheel, { passive: false });
    return () => window.removeEventListener('wheel', onWheel);
  }, []);
}
