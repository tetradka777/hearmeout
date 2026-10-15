'use client';

import { useEffect, useRef } from 'react';
import { imageColor } from '@/lib/imageColor';

// The site's background is made of the cards you're looking at: behind
// every coloured card on screen a big soft patch of its colour, in the
// same place, all blurred together. Scroll, and the patches follow the
// cards and change with them (CSS transitions do the motion). Plain glass
// cards don't add colour; covers and photos give their own (lib/
// imageColor). rev15.css .lbg18.
const MAX = 10;
const CARDS = [
  '.tn15', '.tile[class*="t-c"]', '.arc14', '.bh15', '.dkc13', '.rsh13', '.t-rc', '.mh16', '.ph16', '.t-ac',
  '.alp17 .two > .stack > .cov', '.pd13', '.tile.t-ink',
].join(',');

const known = new Map<string, string | null>(); // image url -> colour
function colorOfImage(url: string): string | null {
  if (known.has(url)) return known.get(url)!;
  known.set(url, null);
  imageColor(url).then((c) => known.set(url, c));
  return null;
}
const urlIn = (v: string) => /url\(["']?([^"')]+)/.exec(v)?.[1] ?? null;
const visibleColor = (c: string) => !!c && c !== 'transparent' && !/rgba?\([^)]*,\s*0(\.0+)?\)$/.test(c) && !/\/\s*0(\.0+)?\)$/.test(c);

function colorOf(el: HTMLElement): string | null {
  const cs = getComputedStyle(el);
  for (const v of ['--tint', '--rc1', '--g1']) {
    const c = cs.getPropertyValue(v).trim();
    if (c && !c.startsWith('url')) return c;
  }
  const img = urlIn(cs.getPropertyValue('--cvbg')) || urlIn(cs.backgroundImage);
  if (img) return colorOfImage(img);
  return visibleColor(cs.backgroundColor) ? cs.backgroundColor : null;
}

export function LiveBackdrop() {
  const host = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const box = host.current;
    if (!box) return;
    const blobs: HTMLSpanElement[] = [];
    for (let i = 0; i < MAX; i++) {
      const b = document.createElement('span');
      box.appendChild(b);
      blobs.push(b);
    }
    let raf = 0;
    let last = 0;
    const draw = () => {
      raf = 0;
      last = performance.now();
      const vw = window.innerWidth, vh = window.innerHeight;
      const screen = [...document.querySelectorAll<HTMLElement>('.rd main > *')].find((e) => e.offsetParent);
      const found: { x: number; y: number; w: number; h: number; c: string; area: number }[] = [];
      if (screen) {
        for (const el of screen.querySelectorAll<HTMLElement>(CARDS)) {
          // The outermost coloured card only (a cover inside a tinted card
          // is already in its colour).
          if (el.parentElement?.closest(CARDS) && screen.contains(el.parentElement.closest(CARDS))) continue;
          const r = el.getBoundingClientRect();
          if (r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw || r.width < 30) continue;
          const c = colorOf(el);
          if (!c) continue;
          const w = Math.min(r.right, vw) - Math.max(r.left, 0), h = Math.min(r.bottom, vh) - Math.max(r.top, 0);
          found.push({ x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, c, area: w * h });
        }
      }
      found.sort((a, b) => b.area - a.area);
      blobs.forEach((b, i) => {
        const f = found[i];
        if (!f) { b.style.opacity = '0'; return; }
        const w = Math.max(160, f.w * 1.25), h = Math.max(160, f.h * 1.25);
        b.style.opacity = '1';
        b.style.width = `${w}px`;
        b.style.height = `${h}px`;
        b.style.transform = `translate(${f.x - w / 2}px, ${f.y - h / 2}px)`;
        b.style.backgroundColor = f.c;
      });
    };
    // On scroll and resize, at most ~8 times a second; and now and then
    // anyway (screens change, cards load, pictures' colours arrive).
    const schedule = () => {
      if (raf) return;
      const wait = Math.max(0, 120 - (performance.now() - last));
      raf = window.setTimeout(() => requestAnimationFrame(draw), wait) as unknown as number;
    };
    window.addEventListener('scroll', schedule, { passive: true, capture: true });
    window.addEventListener('resize', schedule);
    const tick = window.setInterval(schedule, 700);
    schedule();
    return () => {
      window.removeEventListener('scroll', schedule, { capture: true } as EventListenerOptions);
      window.removeEventListener('resize', schedule);
      window.clearInterval(tick);
      clearTimeout(raf);
      blobs.forEach((b) => b.remove());
    };
  }, []);
  return <div className="lbg18" ref={host} aria-hidden="true" />;
}
