// The colours you can pick (2026-10-28: one colour each, tokens.css --pick;
// the ids are the old palettes' and stay as saved on accounts). `id` matches
// the `data-palette` value in src/styles/tokens.css exactly.
export type PaletteId =
  | 'lemons' | 'idea' | 'bloom' | 'autumn' | 'rude-olive' | 'periwinkle'
  | 'moss' | 'forest' | 'sky' | 'coffee' | 'tangerine' | 'acid' | 'grape' | 'cherry';

export type Design = 'cream-pop' | 'toxic';
export type Mode = 'light' | 'dark' | 'system';
export type TimeFormat = '24' | '12';
export type WeekStart = 'mon' | 'sun';

export type PaletteInfo = { id: PaletteId; name: string; group: 'classic' | 'neon' };

export const PALETTES: PaletteInfo[] = [
  { id: 'lemons', name: 'lemon', group: 'classic' },
  { id: 'tangerine', name: 'orange', group: 'classic' },
  { id: 'autumn', name: 'red', group: 'classic' },
  { id: 'cherry', name: 'cherry', group: 'classic' },
  { id: 'rude-olive', name: 'wine', group: 'classic' },
  { id: 'idea', name: 'pink', group: 'classic' },
  { id: 'bloom', name: 'violet', group: 'classic' },
  { id: 'grape', name: 'indigo', group: 'classic' },
  { id: 'periwinkle', name: 'periwinkle', group: 'classic' },
  { id: 'sky', name: 'sky', group: 'classic' },
  { id: 'forest', name: 'green', group: 'classic' },
  { id: 'acid', name: 'lime', group: 'classic' },
  { id: 'moss', name: 'olive', group: 'classic' },
  { id: 'coffee', name: 'brown', group: 'classic' },
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
