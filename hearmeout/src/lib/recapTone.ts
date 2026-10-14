import type { CSSProperties } from 'react';
import type { RecapData } from './types';

// A recap's colour comes from the music in it, not the palette (after
// Superfan, where every recap looks different): the top genre gives the
// main colour, the second one the other end of the gradient. Deep tones,
// so cream text reads on all of them.
const GENRE_TONE: Record<string, string> = {
  Rock: '#B5382C',
  'Hip-Hop': '#B0620F',
  Electronic: '#3346C2',
  'R&B': '#7B2D72',
  Pop: '#C93C78',
  Latin: '#C9501C',
};
const OTHER_TONES = ['#1F7A6E', '#5B3FB0', '#2E6FA8', '#A3402F', '#5E6E1A', '#9A3A5E'];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function toneOf(key: string): string {
  return GENRE_TONE[key] ?? OTHER_TONES[hash(key) % OTHER_TONES.length];
}

// [main, second] — without genres, picked by the top artist (or the
// period), so a recap still gets a colour of its own.
export function recapColors(r: Pick<RecapData, 'topGenres' | 'topArtists'> & { range?: { start: string } }): [string, string] {
  const genres = r.topGenres.map((g) => g.genre);
  const first = genres[0] ? toneOf(genres[0]) : toneOf(r.topArtists[0]?.name || r.range?.start || 'recap');
  const second = genres[1] ? toneOf(genres[1]) : null;
  return [first, second && second !== first ? second : `color-mix(in srgb, ${first} 55%, #120F0C)`];
}

// For a tile with the `t-rc` class (components: rev15.css).
export function recapToneStyle(r: Parameters<typeof recapColors>[0] | undefined | null): CSSProperties | undefined {
  if (!r) return undefined;
  const [a, b] = recapColors(r);
  return { ['--rc1' as string]: a, ['--rc2' as string]: b } as CSSProperties;
}
