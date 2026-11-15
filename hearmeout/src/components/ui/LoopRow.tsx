'use client';

import { Children, Fragment, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createLoopMotion } from '@/lib/loopMotion';
import { RowImagesContext } from '@/lib/RowImagesContext';
import { useNearViewport } from '@/lib/useNearViewport';

// At most three copies; shelves that already fit show each item only once.
export function LoopRow({ children, className = '' }: { children: ReactNode; className?: string }) {
  const items = Children.toArray(children);
  const count = items.length;
  const [ref, near] = useNearViewport<HTMLDivElement>();
  const cycle = useRef(0);
  const [overflow, setOverflow] = useState(true);
  const looping = count > 1 && overflow;
  useLayoutEffect(() => {
    const row = ref.current;
    if (!row || count < 2) return;
    const originalTabs = new Map<HTMLElement, string | null>();
    const motion = createLoopMotion(() => ({ left: row.scrollLeft, cycle: row.clientWidth ? cycle.current : 0 }), left => { row.scrollLeft = left; });
    let hidden = false;
    const measure = () => {
      const first = row.children[0] as HTMLElement | undefined;
      const last = row.children[count - 1] as HTMLElement | undefined;
      if (!first || !last) return;
      if (!row.clientWidth) { hidden = true; return; }
      const gap = parseFloat(getComputedStyle(row).columnGap) || 0;
      const width = last.offsetLeft + last.offsetWidth - first.offsetLeft + gap;
      const fits = width - gap <= row.clientWidth + 1;
      if (fits === overflow) { setOverflow(!fits); return; }
      if (!looping) { cycle.current = 0; return; }
      // Height/image changes must not move an unchanged horizontal layout.
      if (Math.abs(cycle.current - width) < 1) { if (hidden) { hidden = false; motion.settle(); } return; }
      const offset = cycle.current ? ((row.scrollLeft - cycle.current) % cycle.current + cycle.current) % cycle.current : 0;
      cycle.current = width;
      hidden = false;
      row.scrollLeft = width + Math.min(offset, width - 1);
    };
    const labelCopies = () => {
      for (const [index, card] of Array.from(row.children).entries()) {
        const duplicate = looping && (index < count || index >= count * 2);
        if (duplicate) card.setAttribute('aria-hidden', 'true'); else card.removeAttribute('aria-hidden');
        card.querySelectorAll<HTMLElement>('button,a,[tabindex]').forEach(control => {
          if (!originalTabs.has(control)) originalTabs.set(control, control.getAttribute('tabindex'));
          const original = originalTabs.get(control);
          if (duplicate) control.tabIndex = -1;
          else if (original == null) control.removeAttribute('tabindex'); else control.setAttribute('tabindex', original);
        });
      }
    };
    labelCopies();
    // Native touch panning emits pointercancel before touchend. It must
    // not end the gesture and allow rebasing under a finger still down.
    const pointerStart = (event: PointerEvent) => { if (event.pointerType !== 'touch') motion.start(); };
    const pointerEnd = (event: PointerEvent) => { if (event.pointerType !== 'touch') motion.end(); };
    const touchEnd = (event: TouchEvent) => { if (!event.touches?.length) motion.end(); };
    const resize = new ResizeObserver(measure); resize.observe(row);
    const mutations = new MutationObserver(labelCopies); mutations.observe(row, { childList: true });
    row.addEventListener('scroll', motion.scroll, { passive: true });
    row.addEventListener('scrollend', motion.settle);
    row.addEventListener('pointerdown', pointerStart, { passive: true });
    row.addEventListener('touchstart', motion.start, { passive: true });
    window.addEventListener('pointerup', pointerEnd, { passive: true });
    window.addEventListener('pointercancel', pointerEnd, { passive: true });
    row.addEventListener('touchend', touchEnd, { passive: true });
    row.addEventListener('touchcancel', touchEnd, { passive: true });
    return () => {
      motion.stop(); resize.disconnect(); mutations.disconnect();
      row.removeEventListener('scroll', motion.scroll); row.removeEventListener('scrollend', motion.settle);
      row.removeEventListener('pointerdown', pointerStart); row.removeEventListener('touchstart', motion.start);
      window.removeEventListener('pointerup', pointerEnd); window.removeEventListener('pointercancel', pointerEnd);
      row.removeEventListener('touchend', touchEnd); row.removeEventListener('touchcancel', touchEnd);
      Array.from(row.children).forEach(card => card.removeAttribute('aria-hidden'));
      originalTabs.forEach((value, control) => { if (value == null) control.removeAttribute('tabindex'); else control.setAttribute('tabindex', value); });
    };
  }, [count, looping, overflow, ref]);

  return <RowImagesContext.Provider value={near && looping}>
    <div ref={ref} className={`hrow ${className}${looping ? ' loop39' : ''}`}
      onFocusCapture={event => { if ((event.target as HTMLElement).closest('[aria-hidden="true"]')) (event.target as HTMLElement).blur(); }}>
      {(looping ? [0, 1, 2] : [0]).map(copy => <Fragment key={copy}>{items}</Fragment>)}
    </div>
  </RowImagesContext.Provider>;
}
