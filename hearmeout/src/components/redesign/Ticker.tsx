'use client';

import { useEffect, useRef } from 'react';
import { useTickerEvents } from './useTickerEvents';
import { useApp } from '@/lib/AppContext';

// Preserve the scroll offset across navigation without a JS animation loop.
const TK = { owner: '', pixels: 0, id: '', inset: 0 };
const SPEED = 32;

export function Ticker() {
  const { me, feed } = useApp();
  const events = useTickerEvents();
  const enabled = !!me?.tickerEnabled && !!feed;
  const root = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const group = useRef<HTMLDivElement>(null);
  const pause = useRef({ hover: false, focus: false });
  const refresh = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!enabled || !events.length || !root.current || !track.current || !group.current) return;
    if (TK.owner !== me?.id) { TK.owner = me?.id ?? ''; TK.pixels = 0; TK.id = ''; }
    const element = root.current, moving = track.current, first = group.current;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const canHover = matchMedia('(hover: hover)').matches;
    let animation: Animation | null = null;
    let width = 0;
    let slots: {id: string; start: number}[] = [];
    const remember = () => {
      if (animation && typeof animation.currentTime === 'number' && width) {
        TK.pixels = (animation.currentTime * SPEED / 1000) % width;
        const slot = [...slots].reverse().find(item => item.start <= TK.pixels) ?? slots[0];
        if (slot) { TK.id = slot.id; TK.inset = TK.pixels - slot.start; }
      }
    };
    function sync() {
      const staticView = reduced.matches || document.documentElement.dataset.motion === 'off' || !moving.animate;
      element.classList.toggle('calm32', staticView);
      if (staticView) { remember(); animation?.cancel(); animation = null; return; }
      const measured = first.getBoundingClientRect().width;
      if (!measured) { animation?.pause(); return; }
      if (!animation || Math.abs(measured - width) > 1) {
        remember(); animation?.cancel(); width = measured;
        const left = first.getBoundingClientRect().left;
        slots = [...first.children].map((child, i) => ({id: events[i].id, start: child.getBoundingClientRect().left - left}));
        const anchor = slots.find(slot => slot.id === TK.id);
        if (anchor) TK.pixels = Math.max(0, anchor.start + TK.inset);
        animation = moving.animate([{ transform: 'translate3d(0,0,0)' }, { transform: 'translate3d(' + -width + 'px,0,0)' }], { duration: width / SPEED * 1000, iterations: Infinity });
        animation.currentTime = (TK.pixels % width) / SPEED * 1000;
      }
      if (document.hidden || pause.current.focus || (canHover && pause.current.hover)) animation.pause();
      else animation.play();
    }
    refresh.current = sync;
    const resize = new ResizeObserver(sync);
    resize.observe(first);
    const motion = new MutationObserver(sync);
    motion.observe(document.documentElement, { attributes: true, attributeFilter: ['data-motion'] });
    document.addEventListener('visibilitychange', sync);
    reduced.addEventListener('change', sync);
    sync();
    return () => {
      remember(); animation?.cancel(); refresh.current = null;
      resize.disconnect(); motion.disconnect();
      document.removeEventListener('visibilitychange', sync);
      reduced.removeEventListener('change', sync);
    };
  }, [enabled, events, me?.id]);

  if (!enabled || !events.length) return null;
  const messages = events.map(item => <span key={item.id}><b>{item.name}</b> {item.text}</span>);
  return <div className="ticker tk32" ref={root} tabIndex={0} aria-live="off"
    onMouseEnter={() => { pause.current.hover = true; refresh.current?.(); }}
    onMouseLeave={() => { pause.current.hover = false; refresh.current?.(); }}
    onFocus={() => { pause.current.focus = true; refresh.current?.(); }}
    onBlur={() => { pause.current.focus = false; refresh.current?.(); }}>
    <div className="mq"><div className="track" ref={track}>
      <div className="grp" ref={group}>{messages}</div><div className="grp tk32-copy" aria-hidden="true">{messages}</div>
    </div></div>
  </div>;
}
