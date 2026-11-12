'use client';

import { useEffect, useState } from 'react';
import { watchTrackVisibility } from './trackVisibility';

// Whether a play control of the playing track (an element with data-pl =
// its trackKey, outside the bar itself) is on screen right now: then the
// bar isn't needed and stays hidden. Observes matching controls and newly
// added content without scanning the document on scroll. The bottom
// 90px don't count — that's where the menu covers the page on a phone.
export function useTrackOnScreen(key: string | null): boolean {
  const [view, setView] = useState<{ key: string; on: boolean } | null>(null);
  useEffect(() => {
    if (!key) return;
    return watchTrackVisibility(key, on => setView(previous => previous?.key === key && previous.on === on ? previous : { key, on }));
  }, [key]);
  return !!key && view?.key === key && view.on;
}
