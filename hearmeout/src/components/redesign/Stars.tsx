'use client';

import { useRef, type KeyboardEvent, type PointerEvent } from 'react';

// Continuous-fill stars (spec 3.6, 13.6): two overlaid glyph layers, the
// top one clipped to a percentage width — same technique as the old
// ui/StarsAvg.tsx/StarPicker.tsx, just re-themed onto --acct/--acct and
// exposed as one component with a read-only and an interactive mode
// (role="slider", 0.1-step keyboard support) instead of two.
function Glyphs({ pct }: { pct: number }) {
  return (
    <span style={{ position: 'relative', display: 'inline-block', lineHeight: 1 }}>
      <span style={{ opacity: 0.4 }}>★★★★★</span>
      <span style={{ position: 'absolute', inset: 0, overflow: 'hidden', width: `${pct}%`, whiteSpace: 'nowrap' }}>★★★★★</span>
    </span>
  );
}

export function Stars({ value, size = 22, onDark = false }: { value: number; size?: number; onDark?: boolean }) {
  const pct = Math.max(0, Math.min(100, (value / 5) * 100));
  return <span className={`stars${onDark ? ' on-dark' : ''}`} style={{ fontSize: size }}><Glyphs pct={pct} /></span>;
}

export function StarSlider({ value, onChange, size = 28 }: { value: number; onChange: (v: number) => void; size?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const pct = Math.max(0, Math.min(100, (value / 5) * 100));

  function valueFromClientX(clientX: number) {
    const rect = ref.current!.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return Math.max(0.1, Math.round(frac * 50) / 10);
  }
  function onKey(e: KeyboardEvent) {
    const step = e.shiftKey ? 0.5 : 0.1;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); onChange(Math.max(0.1, +(value - step).toFixed(1))); }
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); onChange(Math.min(5, +(value + step).toFixed(1))); }
    else if (e.key === 'Home') { e.preventDefault(); onChange(0.1); }
    else if (e.key === 'End') { e.preventDefault(); onChange(5); }
  }

  return (
    <div
      ref={ref}
      className="stars rs"
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
      <Glyphs pct={pct} />
    </div>
  );
}
