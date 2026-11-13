'use client';

import { Children, Fragment, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { loopPosition } from '@/lib/homePresentation';

// Three bounded copies, never a growing list or a pagination request.
// The middle copy is the keyboard/screen-reader version; visual copies
// retain their real click actions but don't add duplicate tab stops.
export function LoopRow({ children, className = '' }: { children: ReactNode; className?: string }) {
  const items = Children.toArray(children);
  const count = items.length;
  const ref = useRef<HTMLDivElement>(null);
  const cycle = useRef(0);
  const [repeat, setRepeat] = useState(1);
  const looping = count > 1;
  useLayoutEffect(() => {
    const row = ref.current;
    if (!row || !looping) return;
    const originalTabs = new Map<HTMLElement, string | null>();
    const measure = () => {
      const first = row.children[0] as HTMLElement | undefined;
      const next = row.children[count * repeat] as HTMLElement | undefined;
      if (!first || !next || !row.clientWidth) return;
      const width = next.offsetLeft - first.offsetLeft;
      if (width <= 0) return;
      // Short selections still fill a desktop viewport before wrapping.
      const needed = Math.max(1, Math.ceil((row.clientWidth + first.clientWidth) / (width / repeat)));
      if (needed !== repeat) { setRepeat(needed); return; }
      const offset = cycle.current ? ((row.scrollLeft - cycle.current) % cycle.current + cycle.current) % cycle.current : 0;
      cycle.current = width;
      row.scrollLeft = width + Math.min(offset, width - 1);
    };
    const labelCopies = () => {
      for (const [index, card] of Array.from(row.children).entries()) {
        const duplicate = index < count * repeat || index >= count * repeat + count;
        if (duplicate) card.setAttribute('aria-hidden', 'true');
        else card.removeAttribute('aria-hidden');
        card.querySelectorAll<HTMLElement>('button,a,[tabindex]').forEach(control => {
          if (!originalTabs.has(control)) originalTabs.set(control, control.getAttribute('tabindex'));
          const original = originalTabs.get(control);
          if (duplicate) control.tabIndex = -1;
          else if (original == null) control.removeAttribute('tabindex');
          else control.setAttribute('tabindex', original);
        });
      }
    };
    labelCopies();
    const observer = new ResizeObserver(measure);
    observer.observe(row);
    const mutations = new MutationObserver(labelCopies);
    mutations.observe(row, { childList: true });
    return () => {
      observer.disconnect(); mutations.disconnect();
      Array.from(row.children).forEach(card => card.removeAttribute('aria-hidden'));
      originalTabs.forEach((value, control) => {
        if (value == null) control.removeAttribute('tabindex');
        else control.setAttribute('tabindex', value);
      });
    };
  }, [count, repeat, looping]);

  return <div ref={ref} className={`hrow ${className}${looping ? ' loop39' : ''}`}
    onFocusCapture={event => {
      // Clicking a visual copy must not leave focus in aria-hidden content.
      if ((event.target as HTMLElement).closest('[aria-hidden="true"]')) (event.target as HTMLElement).blur();
    }}
    onScroll={event => {
      if (!looping || !cycle.current) return;
      const row = event.currentTarget;
      const next = loopPosition(row.scrollLeft, cycle.current);
      if (Math.abs(next - row.scrollLeft) > 1) row.scrollLeft = next;
    }}>
    {(looping ? [0, 1, 2] : [0]).map(copy => <Fragment key={copy}>
      {Array.from({ length: looping ? repeat : 1 }, (_, repetition) => <Fragment key={repetition}>{items}</Fragment>)}
    </Fragment>)}
  </div>;
}
