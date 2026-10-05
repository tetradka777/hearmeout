// The 13 palettes from the redesign (spec 2.2 / Appendix C). `id` matches
// the `data-palette` value in src/styles/tokens.css exactly.
export type PaletteId =
  | 'lemons' | 'idea' | 'bloom' | 'autumn' | 'rude-olive' | 'periwinkle'
  | 'moss' | 'forest' | 'sky' | 'coffee' | 'acid' | 'grape' | 'cherry';

export type Design = 'cream-pop' | 'toxic';
export type Mode = 'light' | 'dark' | 'system';
export type TimeFormat = '24' | '12';
export type WeekStart = 'mon' | 'sun';

export type PaletteInfo = { id: PaletteId; name: string; group: 'classic' | 'neon' };

export const PALETTES: PaletteInfo[] = [
  { id: 'lemons', name: 'Lemons', group: 'classic' },
  { id: 'idea', name: 'Idea', group: 'classic' },
  { id: 'bloom', name: 'Bloom', group: 'classic' },
  { id: 'autumn', name: 'Autumn', group: 'classic' },
  { id: 'rude-olive', name: 'Rude olive', group: 'classic' },
  { id: 'periwinkle', name: 'Periwinkle', group: 'classic' },
  { id: 'moss', name: 'Moss', group: 'classic' },
  { id: 'forest', name: 'Forest', group: 'classic' },
  { id: 'sky', name: 'Sky', group: 'classic' },
  { id: 'coffee', name: 'Coffee', group: 'classic' },
  { id: 'acid', name: 'Acid', group: 'neon' },
  { id: 'grape', name: 'Grape', group: 'neon' },
  { id: 'cherry', name: 'Cherry', group: 'neon' },
];

export const DEFAULT_PALETTE: PaletteId = 'lemons';
export const DEFAULT_DESIGN: Design = 'cream-pop';
export const DEFAULT_MODE: Mode = 'light';

export function isPaletteId(v: string): v is PaletteId {
  return PALETTES.some((p) => p.id === v);
}
export function isDesign(v: string): v is Design {
  return v === 'cream-pop' || v === 'toxic';
}
export function isMode(v: string): v is Mode {
  return v === 'light' || v === 'dark' || v === 'system';
}

// Resolves "system" against the OS preference; call only on the client.
export function resolveMode(mode: Mode): 'light' | 'dark' {
  if (mode !== 'system') return mode;
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}
