'use client';

import { useRef, useState } from 'react';

// A swipe switches the item when it goes far enough or fast enough.
const SWIPE_PX = 48;
const FLICK_PX_PER_MS = 0.3;
// Movement under this is a tap, not a swipe.
const TAP_PX = 8;

type Drag = { id: number; x: number; y: number; t: number; dy: number; vertical: boolean | null };

// One item of a list at a time, changed by swiping the cover up or down (the
// card follows the finger and lets go into the next or previous one) or by
// the dots. Used by "picks from friends" and the group's vote.
export function useSwipeDeck(count: number) {
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState<'up' | 'down'>('up');
  const [dy, setDy] = useState(0);
  const drag = useRef<Drag | null>(null);
  const swiped = useRef(false);
  const i = Math.max(0, Math.min(index, count - 1));
  const many = count > 1;
  const show = (n: number, d: 'up' | 'down') => { setDir(d); setIndex((n + count) % count); };

  const handlers = {
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      swiped.current = false;
      if (!many) return;
      drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp, dy: 0, vertical: null };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
      const d = drag.current;
      if (!d || d.id !== e.pointerId) return;
      const ddx = e.clientX - d.x, ddy = e.clientY - d.y;
      // The first clear movement decides: sideways isn't a swipe here.
      if (d.vertical === null && Math.max(Math.abs(ddx), Math.abs(ddy)) > TAP_PX) d.vertical = Math.abs(ddy) > Math.abs(ddx);
      if (!d.vertical) return;
      d.dy = ddy;
      // A little resistance, so it feels held rather than slid away.
      setDy(Math.sign(ddy) * Math.min(90, Math.abs(ddy) * 0.6));
    },
    onPointerUp: (e: React.PointerEvent<HTMLElement>) => {
      const d = drag.current;
      drag.current = null;
      setDy(0);
      if (!d || d.id !== e.pointerId || !d.vertical) return;
      const speed = Math.abs(d.dy) / Math.max(1, e.timeStamp - d.t);
      if (Math.abs(d.dy) >= SWIPE_PX || (Math.abs(d.dy) > 20 && speed > FLICK_PX_PER_MS)) {
        swiped.current = true;
        if (d.dy < 0) show(i + 1, 'up');
        else show(i - 1, 'down');
      } else if (Math.abs(d.dy) > TAP_PX) {
        swiped.current = true;
      }
    },
    onPointerCancel: () => { drag.current = null; setDy(0); },
  };

  // True when the click that follows a pointer-up was a real tap.
  const tapped = () => { const ok = !swiped.current; swiped.current = false; return ok; };
  // The moving part's class and style while it's being dragged.
  const inClass = `in ${dir}${dy ? ' drg' : ''}`;
  const inStyle = dy ? { transform: `translateY(${dy}px)`, opacity: 1 - Math.abs(dy) / 220 } : undefined;

  return { i, many, show, handlers, tapped, inClass, inStyle };
}
