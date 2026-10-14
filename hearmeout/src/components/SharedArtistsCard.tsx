'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useApp } from '@/lib/AppContext';
import { useArtistPhoto } from '@/lib/artistPhotos';
import { imageColor } from '@/lib/imageColor';
import { sizedImage } from '@/lib/imageSize';
import { ArtistAvatar, useOpenArtist } from './ui/ArtistName';

// Without a photo (or one we can't read), a colour of its own by name.
const FALLBACK = ['#C9563C', '#3E6FB0', '#7B4AA8', '#2E8A6E', '#C28A1E', '#B0436E'];
function fallbackColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return FALLBACK[Math.abs(h) % FALLBACK.length];
}

function Cell({ name, onColor, onOpen }: { name: string; onColor: (name: string, color: string) => void; onOpen: () => void }) {
  const { t } = useApp();
  const photo = useArtistPhoto(name, true);
  useEffect(() => {
    if (photo === undefined) return; // still looking
    if (!photo) { onColor(name, fallbackColor(name)); return; }
    let live = true;
    imageColor(sizedImage(photo, 64) ?? photo).then((c) => { if (live) onColor(name, c ?? fallbackColor(name)); });
    return () => { live = false; };
  }, [photo, name, onColor]);
  return (
    <button data-artist={name} onClick={onOpen} aria-label={t('artist.openNamed', { name })}>
      <ArtistAvatar name={name} size={64} />
      <small>{name}</small>
    </button>
  );
}

// "Shared artists" on Match as one colourful card: behind each artist the
// colour of their photo, flowing into the next artist's colour between
// them (one soft radial glow per artist, laid where their photo sits).
export function SharedArtistsCard({ names, shown, title, empty }: { names: string[]; shown: number; title: string; empty: string }) {
  const openArtist = useOpenArtist();
  const ref = useRef<HTMLDivElement | null>(null);
  const [colors, setColors] = useState<Record<string, string>>({});
  const onColor = useCallback((name: string, color: string) => {
    setColors((prev) => (prev[name] === color ? prev : { ...prev, [name]: color }));
  }, []);
  const list = names.slice(0, shown);

  // Glows where the photos are; redone when the card changes size.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const draw = () => {
      const box = el.getBoundingClientRect();
      const glows: string[] = [];
      for (const cell of el.querySelectorAll<HTMLElement>('[data-artist]')) {
        const color = colors[cell.dataset.artist || ''];
        if (!color) continue;
        const r = cell.getBoundingClientRect();
        const x = Math.round(r.left - box.left + r.width / 2);
        const y = Math.round(r.top - box.top + 32);
        glows.push(`radial-gradient(circle at ${x}px ${y}px, ${color} 0, ${color} 34px, color-mix(in srgb, ${color} 55%, transparent) 70px, transparent 150px)`);
      }
      // Set straight on the element: it follows layout, not React state.
      el.style.backgroundImage = glows.join(', ');
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(el);
    return () => ro.disconnect();
  }, [colors, list.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="tile sac15" ref={ref}>
      <h2>{title}</h2>
      {names.length ? (
        <div className="sha13">
          {list.map((n) => <Cell key={n} name={n} onColor={onColor} onOpen={() => openArtist(n)} />)}
          {names.length > shown && <span className="more13"><span>+{names.length - shown}</span></span>}
        </div>
      ) : <p className="muted" style={{ fontWeight: 600 }}>{empty}</p>}
    </div>
  );
}
