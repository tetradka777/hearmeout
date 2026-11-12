'use client';

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { sizedImage } from '@/lib/imageSize';
import { coverImages } from '@/lib/coverImages';
import { whenNear } from '@/lib/nearViewport';

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
// Mirrors the prototype's attachImageFallback(): probe the image, and if it
// 404s/errors, fall back to the gradient + first-letter treatment instead.
export function CoverArt({ url: rawUrl, fallbackLetter, className = '', style, fallbackStyle, children, onClick, px }: Props) {
  const size = px ?? (typeof style?.width === 'number' ? style.width : undefined);
  const url = size ? sizedImage(rawUrl, size) : rawUrl;
  const [nearUrl, setNearUrl] = useState<string | undefined>(undefined);
  const [, changed] = useState(0);
  const ref = useRef<HTMLDivElement | null>(null);
  const result = url ? coverImages.read(url) : undefined;
  const near = !!url && (nearUrl === url || result === 'loaded' || result === 'loading');

  useEffect(() => {
    const el = ref.current;
    if (!el || !url || near) return;
    return whenNear(el, () => setNearUrl(url));
  }, [url, near]);

  useEffect(() => {
    if (!url || !near) return;
    // Shared work and a URL-specific subscription: an old failure cannot
    // clear a different cover after navigation or an album switch.
    return coverImages.watch(url, () => changed(n => n + 1));
  }, [url, near]);

  useEffect(() => {
    const el = ref.current;
    if (!url || !el || result !== 'failed') return;
    const visible = () => {
      const rect = el.getBoundingClientRect();
      return !document.hidden && rect.width > 0 && rect.height > 0 && rect.bottom >= 0 && rect.top <= window.innerHeight && rect.right >= 0 && rect.left <= window.innerWidth;
    };
    const online = () => { if (visible()) coverImages.retry(url, true); };
    const resumed = () => { if (visible()) coverImages.retry(url); };
    const observer = new IntersectionObserver(entries => {
      if (!document.hidden && entries.some(entry => entry.isIntersecting)) coverImages.retry(url);
    }, { rootMargin: '100px' });
    observer.observe(el);
    window.addEventListener('online', online);
    document.addEventListener('visibilitychange', resumed);
    return () => { observer.disconnect(); window.removeEventListener('online', online); document.removeEventListener('visibilitychange', resumed); };
  }, [url, result]);

  const showFallback = !url || result === 'failed';
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
