'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { sizedImage } from './imageSize';

// The main colour of a picture (an artist's photo), for tinting what's
// around it: the image drawn tiny on a canvas and averaged, with the
// greys weighed less so a coloured detail wins over a grey background.
// Needs the image host to allow cross-origin reads (Spotify does); when
// it doesn't, or the picture is still loading, the answer is null.
const cache = new Map<string, Promise<string | null>>();

// Colours already worked out, kept in the browser (by picture, so it's the
// same for every account): a cover's colour no longer costs a download on
// the next visit. Only real answers are kept, the newest STORE_MAX.
const STORE_KEY = 'hmo-img-colors-v1';
const STORE_MAX = 800;
let stored: Map<string, string> | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
function storedColors(): Map<string, string> {
  if (stored) return stored;
  stored = new Map();
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) for (const [k, v] of JSON.parse(raw) as [string, string][]) stored.set(k, v);
  } catch { /* no storage */ }
  return stored;
}
function remember(key: string, color: string): void {
  const m = storedColors();
  m.delete(key);
  m.set(key, color);
  while (m.size > STORE_MAX) m.delete(m.keys().next().value!);
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try { localStorage.setItem(STORE_KEY, JSON.stringify([...m])); } catch { /* full or blocked */ }
  }, 2000);
}

function average(img: HTMLImageElement): string | null {
  const c = document.createElement('canvas');
  c.width = 12;
  c.height = 12;
  const g = c.getContext('2d', { willReadFrequently: true });
  if (!g) return null;
  g.drawImage(img, 0, 0, 12, 12);
  const d = g.getImageData(0, 0, 12, 12).data;
  let r = 0, gr = 0, b = 0, w = 0;
  for (let i = 0; i < d.length; i += 4) {
    const max = Math.max(d[i], d[i + 1], d[i + 2]);
    const min = Math.min(d[i], d[i + 1], d[i + 2]);
    const weight = 0.25 + (max - min) / 255; // more colourful counts more
    r += d[i] * weight; gr += d[i + 1] * weight; b += d[i + 2] * weight; w += weight;
  }
  if (!w) return null;
  return vivid(r / w / 255, gr / w / 255, b / w / 255);
}

// The averaged colour made lively enough to tint with: some saturation and
// a middle lightness (a dark photo would otherwise give a muddy brown).
function vivid(r: number, g: number, b: number): string {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0;
  const d = max - min;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const l0 = (max + min) / 2;
  const s0 = d ? d / (1 - Math.abs(2 * l0 - 1)) : 0;
  const s = d < 0.04 ? 0.18 : Math.max(0.5, Math.min(0.85, s0 * 1.4));
  const l = Math.max(0.5, Math.min(0.68, l0 + 0.15));
  return `hsl(${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%)`;
}

export function imageColor(url: string): Promise<string | null> {
  // The smallest variant is plenty for a 12×12 average (64 px ≈ 3 KB
  // instead of the 300 px ≈ 35 KB cover).
  const src = sizedImage(url, 24) ?? url;
  let p = cache.get(src);
  if (!p) {
    const known = storedColors().get(src);
    p = known ? Promise.resolve(known) : new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.decoding = 'async';
      img.onload = () => {
        let c: string | null = null;
        try { c = average(img); } catch { /* unreadable */ }
        if (c) remember(src, c);
        resolve(c);
      };
      img.onerror = () => resolve(null);
      img.src = src;
    });
    cache.set(src, p);
  }
  return p;
}

// Colours for several pictures at once, by url (missing until known).
export function useImageColors(urls: (string | null | undefined)[]): Record<string, string> {
  const [colors, setColors] = useState<Record<string, string>>({});
  const key = urls.filter(Boolean).join('|');
  useEffect(() => {
    let cancelled = false;
    for (const u of key ? key.split('|') : []) {
      imageColor(u).then((c) => { if (c && !cancelled) setColors((prev) => (prev[u] === c ? prev : { ...prev, [u]: c })); });
    }
    return () => { cancelled = true; };
  }, [key]);
  return colors;
}

// One picture's colour (null until known, or when it can't be read).
export function useImageColor(url: string | null | undefined): string | null {
  const [color, setColor] = useState<{ url: string; c: string | null } | null>(null);
  useEffect(() => {
    if (!url) return;
    let live = true;
    imageColor(url).then((c) => { if (live) setColor({ url, c }); });
    return () => { live = false; };
  }, [url]);
  return url && color?.url === url ? color.c : null;
}

// Inline styles for the two ways a card takes a picture's look: a plate
// tinted with its colour (.tn15), or the picture itself blurred behind
// everything (.bh15) — rev15.css.
export function tintStyle(color: string | null | undefined): CSSProperties | undefined {
  return color ? ({ ['--tint' as string]: color } as CSSProperties) : undefined;
}
// Blurred, so a small picture is enough (a 640 px cover is ~125 KB, the
// 300 px one ~35 KB and usually already loaded for the cover itself).
// `px`: the on-screen size to pick the picture for.
export function blurStyle(url: string | null | undefined, px = 150): CSSProperties | undefined {
  const src = sizedImage(url, px) ?? url;
  return src ? ({ ['--cvbg' as string]: `url('${src}')` } as CSSProperties) : undefined;
}
