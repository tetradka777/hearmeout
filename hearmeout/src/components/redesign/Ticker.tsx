'use client';

import { useEffect, useRef } from 'react';
import { useTickerEvents } from './useTickerEvents';

// Activity ticker (spec 3.8, 14 #1, Appendix F "Ticker"). The critical
// requirement: it must never restart, stop or jump when the app navigates
// or re-renders. Two things make that true here:
//   1. The scroll offset lives in module-level state (outside React and
//      outside the DOM), so even if this component were ever recreated the
//      position survives — not just "as long as Shell doesn't unmount".
//   2. Each frame writes `transform` straight to the track element via a
//      ref, bypassing React's render cycle entirely, so re-renders of the
//      rest of the app (screen changes, state updates) can't touch it.
// Mount this once in the app shell, outside the route outlet (spec 17.1).
const TK = { pos: 0, last: 0 };
const DUR_MS = 36000; // one full group, i.e. 50% of the (two-group) track

function motionOn(): boolean {
  if (typeof document === 'undefined') return true;
  if (document.documentElement.dataset.motion === 'off') return false;
  if (typeof matchMedia === 'undefined') return true;
  return !matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function Ticker() {
  const events = useTickerEvents();
  const tickerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const hoveringRef = useRef(false);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const apply = () => {
      const t = trackRef.current;
      if (t) t.style.transform = `translate3d(-${TK.pos.toFixed(3)}%,0,0)`;
    };
    apply(); // restore whatever offset a previous mount (or hot reload) left

    const canHover = typeof matchMedia !== 'undefined' && matchMedia('(hover: hover)').matches;

    function loop(ts: number) {
      const dt = TK.last ? Math.min(100, ts - TK.last) : 0; // cap: a backgrounded tab can't cause a jump
      TK.last = ts;
      if (dt && !(canHover && hoveringRef.current) && motionOn()) {
        TK.pos += (dt / DUR_MS) * 50;
        if (TK.pos >= 50) TK.pos -= 50;
      }
      apply();
      rafRef.current = requestAnimationFrame(loop);
    }
    rafRef.current = requestAnimationFrame(loop);
    return () => { if (rafRef.current != null) cancelAnimationFrame(rafRef.current); TK.last = 0; };
  }, []);

  if (!events.length) return null;

  const group = (key: string) => (
    <span className="grp" key={key}>
      {events.map((e) => (
        <span key={e.id}><b>{e.name}</b> {e.text}</span>
      ))}
    </span>
  );

  return (
    <div
      className="ticker"
      ref={tickerRef}
      aria-hidden="true"
      onMouseEnter={() => { hoveringRef.current = true; }}
      onMouseLeave={() => { hoveringRef.current = false; }}
    >
      <div className="mq">
        <div className="track" ref={trackRef}>
          {group('a')}
          {group('b')}
        </div>
      </div>
    </div>
  );
}
