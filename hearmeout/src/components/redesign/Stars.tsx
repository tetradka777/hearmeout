'use client';

import { useRef, type KeyboardEvent, type PointerEvent } from 'react';

// Pixel-exact port of the prototype's star rendering (reference/app.js
// `stars()` + `.st`/`.s0`/`.sf` in reference/styles.css): five independent
// stars, each its own absolutely-positioned pair of the same SVG polygon
// (not a text glyph) — an outline copy at 45% opacity, and a filled copy
// clipped to that one star's own 0–100% fill. Clipping per star (not one
// shared clip across all five) is what the prototype actually does, and
// it matters: with the 3px gap between stars, a single whole-row clip
// would cut through the gaps at a slightly different point than five
// independent per-star clips do.
const STAR_POINTS = '12,2.5 14.9,9 22,9.6 16.6,14.3 18.3,21.3 12,17.6 5.7,21.3 7.4,14.3 2,9.6 9.1,9';

function StarGlyph({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 24 24" style={{ width: size, height: size, display: 'block' }}>
      <polygon points={STAR_POINTS} />
    </svg>
  );
}

function FiveStars({ value, size }: { value: number; size: number }) {
  const r = value || 0;
  return (
    <>
      {[0, 1, 2, 3, 4].map((i) => {
        const f = Math.max(0, Math.min(1, r - i)) * 100;
        return (
          <span key={i} className="st" style={{ width: size, height: size }}>
            <span className="s0"><StarGlyph size={size} /></span>
            <span className="sf" style={{ width: `${f}%` }}><StarGlyph size={size} /></span>
          </span>
        );
      })}
    </>
  );
}

export function Stars({ value, size = 22, onDark = false }: { value: number; size?: number; onDark?: boolean }) {
  return <span className={`stars${onDark ? ' on-dark' : ''}`} style={{ fontSize: size }}><FiveStars value={value} size={size} /></span>;
}

export function StarSlider({ value, onChange, size = 28, onDark = false }: { value: number; onChange: (v: number) => void; size?: number; onDark?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  // Mirrors reference/app.js rsVal(): round the raw fraction to a 1–50
  // integer (tenths of a star) before clamping, not the other way round.
  function valueFromClientX(clientX: number) {
    const rect = ref.current!.getBoundingClientRect();
    return Math.max(1, Math.min(50, Math.round(((clientX - rect.left) / rect.width) * 50))) / 10;
  }
  // Mirrors the prototype's key map exactly: Left/Down -0.1, Right/Up
  // +0.1, Shift multiplies the step by 5 (so Shift+arrow is ±0.5, the
  // same amount PageUp/PageDown apply directly), Home/End jump to the
  // min/max via a deliberately oversized offset that then gets clamped.
  function onKey(e: KeyboardEvent) {
    const steps: Record<string, number> = { ArrowRight: 0.1, ArrowUp: 0.1, ArrowLeft: -0.1, ArrowDown: -0.1, PageUp: 0.5, PageDown: -0.5, Home: -5, End: 5 };
    const st = steps[e.key];
    if (st === undefined) return;
    e.preventDefault();
    const delta = e.shiftKey ? st * 5 : st;
    onChange(Math.max(0.1, Math.min(5, Math.round((value + delta) * 10) / 10)));
  }

  return (
    <div
      ref={ref}
      className={`stars rs${onDark ? ' on-dark' : ''}`}
      role="slider"
      tabIndex={0}
      aria-valuemin={0.1}
      aria-valuemax={5}
      aria-valuenow={value || 0.1}
      style={{ fontSize: size }}
      onPointerDown={(e: PointerEvent) => { dragging.current = true; (e.target as Element).setPointerCapture(e.pointerId); onChange(valueFromClientX(e.clientX)); }}
      onPointerMove={(e: PointerEvent) => { if (dragging.current) onChange(valueFromClientX(e.clientX)); }}
      onPointerUp={() => { dragging.current = false; }}
      onKeyDown={onKey}
    >
      <FiveStars value={value} size={size} />
    </div>
  );
}
