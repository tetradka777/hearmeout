// Two tokens from the active palette (spec Appendix C: --acct is the
// accent text/graphics color, --hi is the palette's secondary highlight
// hue) mixed by ratio, so charts and ratings use a real spread across the
// palette instead of one flat color repeated. color-mix() reads the CSS
// variables directly, so it stays correct for every palette with no JS
// color math involved.
export function accentMix(ratio: number): string {
  const pct = Math.round(Math.max(0, Math.min(1, ratio)) * 100);
  return `color-mix(in srgb, var(--hi) ${pct}%, var(--acct))`;
}

// For a set of values (e.g. one bar chart) — 0 at the smallest value in the
// set, 1 at the largest, so the spread of colors reflects that specific
// chart's own range rather than an arbitrary fixed scale.
export function accentMixForValue(value: number, min: number, max: number): string {
  if (max <= min) return accentMix(0.5);
  return accentMix((value - min) / (max - min));
}
