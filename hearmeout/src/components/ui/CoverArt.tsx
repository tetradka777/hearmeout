'use client';

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { sizedImage } from '@/lib/imageSize';

type Props = {
  url?: string;
  fallbackLetter: string;
  className?: string;
  style?: CSSProperties;
  fallbackStyle?: CSSProperties;
  children?: ReactNode;
  onClick?: () => void;
  // Width on screen in CSS px, to load a smaller picture (lib/imageSize).
  // Taken from a numeric style.width when not given; a full-width cover
  // with neither keeps the full-size picture.
  px?: number;
};

// Covers load when they come near the screen: a hidden screen or the far
// end of a 50-card shelf used to download every picture at once. Until
// then the cover is its plain placeholder. In a sideways row the row itself
// has to come near first, then each card as the row scrolls to it (the row
// clips its cards, so the page alone can't tell).
const NEAR_PX = 800;
const observers = new Map<Element | null, IntersectionObserver>();
const waiting = new Map<Element, Set<() => void>>();
function observerFor(root: Element | null): IntersectionObserver {
  let o = observers.get(root);
  if (!o) {
    const made: IntersectionObserver = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const cbs = waiting.get(e.target);
        waiting.delete(e.target);
        made.unobserve(e.target);
        cbs?.forEach((cb) => cb());
      }
    }, { root, rootMargin: root ? `0px ${NEAR_PX}px` : `${NEAR_PX}px 0px` });
    o = made;
    observers.set(root, o);
    // Rows come and go with screens; their observers go with them.
    if (root) setTimeout(function sweep() { if (!root.isConnected) { made.disconnect(); observers.delete(root); } else setTimeout(sweep, 60000); }, 60000);
  }
  return o;
}
function watch(root: Element | null, el: Element, cb: () => void): () => void {
  const cbs = waiting.get(el) ?? new Set();
  cbs.add(cb);
  waiting.set(el, cbs);
  const o = observerFor(root);
  o.observe(el);
  return () => {
    const left = waiting.get(el);
    left?.delete(cb);
    if (left && !left.size) { waiting.delete(el); o.unobserve(el); }
  };
}
function whenNear(el: Element, cb: () => void): () => void {
  if (typeof IntersectionObserver === 'undefined') { cb(); return () => {}; }
  const row = el.parentElement?.closest('.hrow') ?? null;
  if (!row) return watch(null, el, cb);
  let undo = watch(null, row, () => { undo = watch(row, el, cb); });
  return () => undo();
}

// Mirrors the prototype's attachImageFallback(): probe the image, and if it
// 404s/errors, fall back to the gradient + first-letter treatment instead.
export function CoverArt({ url: rawUrl, fallbackLetter, className = '', style, fallbackStyle, children, onClick, px }: Props) {
  const size = px ?? (typeof style?.width === 'number' ? style.width : undefined);
  const url = size ? sizedImage(rawUrl, size) : rawUrl;
  const [failed, setFailed] = useState(false);
  const [near, setNear] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || near) return;
    return whenNear(el, () => setNear(true));
  }, [near]);

  useEffect(() => {
    setFailed(false);
    if (!url || !near) return;
    const img = new window.Image();
    img.onerror = () => setFailed(true);
    img.src = url;
  }, [url, near]);

  const showFallback = !url || failed;
  return (
    <div
      ref={ref}
      className={`${className} ${showFallback ? 'cover-fallback' : ''}`.trim()}
      style={showFallback || !near ? style : { backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat', ...style, backgroundColor: 'transparent', backgroundImage: `url('${url}')` }}
      onClick={onClick}
    >
      {showFallback && <span className="fallback-letter" style={fallbackStyle}>{fallbackLetter}</span>}
      {children}
    </div>
  );
}
