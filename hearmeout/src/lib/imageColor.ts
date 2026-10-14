'use client';

import { useEffect, useState } from 'react';

// The main colour of a picture (an artist's photo), for tinting what's
// around it: the image drawn tiny on a canvas and averaged, with the
// greys weighed less so a coloured detail wins over a grey background.
// Needs the image host to allow cross-origin reads (Spotify does); when
// it doesn't, or the picture is still loading, the answer is null.
const cache = new Map<string, Promise<string | null>>();

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
  let p = cache.get(url);
  if (!p) {
    p = new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.decoding = 'async';
      img.onload = () => { try { resolve(average(img)); } catch { resolve(null); } };
      img.onerror = () => resolve(null);
      img.src = url;
    });
    cache.set(url, p);
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
