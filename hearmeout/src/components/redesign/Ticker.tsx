'use client';

import { useEffect, useRef, useState } from 'react';
import { useTickerEvents } from './useTickerEvents';
import { useApp } from '@/lib/AppContext';
import { nextTickerPosition, syncTickerPosition, tickerHoldMs, type TickerPosition } from '@/lib/tickerRotation';

// Keep the event and its reading time across navigation or a remount.
// Rotate complete phrases: a marquee can scroll the author out of view
// while leaving an otherwise anonymous "played ..." on a narrow phone.
const TK: TickerPosition = { id: null, elapsedMs: 0 };

export function Ticker() {
  const { me, feed } = useApp();
  const events = useTickerEvents();
  const enabled = !!me?.tickerEnabled && !!feed;
  const [currentId, setCurrentId] = useState<string | null>(null);
  const pauseRef = useRef({ hover: false, focus: false });
  const refreshRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!enabled || !events.length) return;
    const reducedMotion = typeof matchMedia !== 'undefined' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
    const canHover = typeof matchMedia !== 'undefined' && matchMedia('(hover: hover)').matches;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let startedAt: number | null = null;

    function stop() {
      if (timer != null) clearTimeout(timer);
      timer = null;
      if (startedAt != null) {
        TK.elapsedMs += performance.now() - startedAt;
        startedAt = null;
      }
    }

    function refresh() {
      stop();
      Object.assign(TK, syncTickerPosition(TK, events));
      setCurrentId(TK.id);
      if (events.length < 2 || document.hidden || document.documentElement.dataset.motion === 'off'
        || reducedMotion?.matches || pauseRef.current.focus || (canHover && pauseRef.current.hover)) return;
      const event = events.find((item) => item.id === TK.id)!;
      startedAt = performance.now();
      timer = setTimeout(() => {
        stop();
        Object.assign(TK, nextTickerPosition(TK, events));
        refresh();
      }, Math.max(0, tickerHoldMs(event) - TK.elapsedMs));
    }

    // No continuous animation loop, including while the tab is hidden or
    // motion is disabled. Resume the remaining reading time after a pause.
    refreshRef.current = refresh;
    document.addEventListener('visibilitychange', refresh);
    reducedMotion?.addEventListener('change', refresh);
    const observer = new MutationObserver(refresh);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-motion'] });
    refresh();
    return () => {
      stop();
      refreshRef.current = null;
      document.removeEventListener('visibilitychange', refresh);
      reducedMotion?.removeEventListener('change', refresh);
      observer.disconnect();
    };
  }, [enabled, events]);

  // Settings → Extras → Activity strip turns it off (prototype ticker()).
  if (!enabled) return null;
  if (!events.length) return null;

  const event = events.find((item) => item.id === currentId) ?? events[0];

  return (
    <div
      className="ticker tk31"
      tabIndex={0}
      aria-live="off"
      onMouseEnter={() => { pauseRef.current.hover = true; refreshRef.current?.(); }}
      onMouseLeave={() => { pauseRef.current.hover = false; refreshRef.current?.(); }}
      onFocus={() => { pauseRef.current.focus = true; refreshRef.current?.(); }}
      onBlur={() => { pauseRef.current.focus = false; refreshRef.current?.(); }}
    >
      {events.map(item => <span className={`tk31-message${item.id === event.id ? ' on' : ''}`} key={item.id} aria-hidden={item.id !== event.id}><b>{item.name}</b> {item.text}</span>)}
    </div>
  );
}
