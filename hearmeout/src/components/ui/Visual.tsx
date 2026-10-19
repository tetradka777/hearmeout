'use client';

import type { ReactNode } from 'react';
import { userAvatarStyle } from '@/lib/format';
import { CoverArt } from './CoverArt';
import { ArtistName } from './ArtistName';
import { Initial } from './Initial';
import { sizedImage } from '@/lib/imageSize';
import { tintStyle, useImageColor } from '@/lib/imageColor';
import { fmt1 } from '@/lib/numberFormat';

// Pictures instead of tables (after Superfan, which shows no raw data): a
// wall of covers, people as cards, numbers as short phrases. Styles in
// rev15.css (.cw15, .pc15, .ph15, .gf15).

export type WallItem = {
  key: string; cover?: string | null; title: string; artist?: string | null; artistId?: string | null;
  // A small round badge on the cover (a score), and one line under the artist.
  badge?: ReactNode; sub?: ReactNode; onClick?: () => void;
  // A small control over the cover's top corner (e.g. un-love).
  corner?: ReactNode;
};

// Albums or tracks as a grid of covers: 3 across on a phone, more on a
// computer; a score sits on the cover's corner.
// `row`: one line you swipe through instead of a grid.
export function CoverWall({ items, small, row }: { items: WallItem[]; small?: boolean; row?: boolean }) {
  return (
    <div className={`cw15${small ? ' sm' : ''}${row ? ' hrow row' : ''}`}>
      {items.map((it) => <WallCell key={it.key} it={it} small={small} />)}
    </div>
  );
}

// One cover on a plate of its colour.
function WallCell({ it, small }: { it: WallItem; small?: boolean }) {
  const tint = useImageColor(it.cover ? sizedImage(it.cover, 64) ?? it.cover : null);
  return (
    <div className={`it tn15${tint ? '' : ` ${toneClass(it.title)}`}`} style={tintStyle(tint ?? toneColor(it.title))}>
      <button className="im" onClick={it.onClick} aria-label={it.title} disabled={!it.onClick}>
        <CoverArt url={it.cover ?? undefined} fallbackLetter={(it.artist || it.title)[0] || '?'} className="cov" px={small ? 120 : 180} style={{ width: '100%', aspectRatio: '1' }} />
        {it.badge != null && <span className="bg">{it.badge}</span>}
      </button>
      {it.corner && <span className="cn">{it.corner}</span>}
      <span className="tx">
        <b>{it.title}</b>
        {it.artist && <small><ArtistName name={it.artist} id={it.artistId} size={14} /></small>}
        {it.sub && <small className="sb">{it.sub}</small>}
      </span>
    </div>
  );
}

export type PersonItem = { id: string; name: string; avatarUrl: string | null; value?: ReactNode; sub?: ReactNode; onClick?: () => void; action?: ReactNode };

// People as cards you swipe through: a big round photo, the name, one
// highlighted value (a match %, hours) and a line under it.
export function PersonCards({ people, grid }: { people: PersonItem[]; grid?: boolean }) {
  return (
    <div className={grid ? 'pc15 grid' : 'hrow pc15'}>
      {people.map((p) => <PersonCell key={p.id} p={p} />)}
    </div>
  );
}

// A person on a plate of their colour: from their photo, or their own
// tone by name when there's no photo.
function PersonCell({ p }: { p: PersonItem }) {
  const tint = usePersonColor(p);
  return (
    <div className="pcd">
      <button className="pb tn15" style={tintStyle(tint)} onClick={p.onClick} disabled={!p.onClick}>
        <span className="av" style={{ ...userAvatarStyle(p), backgroundSize: 'cover' }}>{!p.avatarUrl && <Initial name={p.name} />}</span>
        <b>{p.name}</b>
        {p.value != null && <span className="vl">{p.value}</span>}
        {p.sub && <small>{p.sub}</small>}
      </button>
      {p.action}
    </div>
  );
}

// A person's colour everywhere on the site: their photo's, else a tone
// picked by their id (or name).
export function usePersonColor(p: { id?: string; name: string; avatarUrl: string | null }): string {
  const photo = useImageColor(p.avatarUrl);
  return photo ?? toneColor(p.id || p.name);
}

// A few numbers as one phrase of pills ("152 albums · 7.4 average"), not
// a table of figures.
export function Phrase({ parts }: { parts: [value: ReactNode, label: ReactNode][] }) {
  return (
    <p className="ph15">
      {parts.map(([v, l], i) => <span key={i}><b>{v}</b> {l}</span>)}
    </p>
  );
}

// Genres as chips that fill up to their share (or score).
export function GenreFill({ items }: { items: { name: string; share: number; label?: ReactNode }[] }) {
  return (
    <div className="gf15">
      {items.map((g) => (
        <span key={g.name} style={{ ['--w' as string]: `${Math.max(6, Math.min(100, Math.round(g.share * 100)))}%` }}>
          <b>{g.name}</b>{g.label != null && <small>{g.label}</small>}
        </span>
      ))}
    </div>
  );
}

// A bright colour per genre for charts on the dark cards — always the same
// for the same genre, and the common ones never share one (a hash of the
// name gave rock and pop the same pink).
const GENRE_COLORS: Record<string, string> = {
  rock: '#FF6B5A', pop: '#FF85BE', 'hip-hop': '#FFB547', 'r&b': '#C58BFF', electronic: '#6E8BFF', latin: '#FF8A3D',
  jazz: '#4FD1C5', indie: '#9BE15D', classical: '#E8D9A8', metal: '#B6BFCC', country: '#E6B85C', folk: '#8FD18B',
  soul: '#F2A65A', alternative: '#5ED3F3', 'k-pop': '#FF9EDB', reggae: '#7BD88F', blues: '#7FA7FF', punk: '#FF5F8F',
};
const GENRE_FALLBACK = ['#5ED3F3', '#F2A65A', '#9BE15D', '#B6BFCC', '#FF9EDB', '#E8D9A8'];
export function genreColor(name: string): string {
  const k = name.trim().toLowerCase();
  if (GENRE_COLORS[k]) return GENRE_COLORS[k];
  let h = 0;
  for (let i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) | 0;
  return GENRE_FALLBACK[Math.abs(h) % GENRE_FALLBACK.length];
}

// Your average score per genre as bars on a 0–5 scale: the genre, a bar in
// the genre's colour that grows in, the score big and how many ratings it
// stands on.
export function ScoreBars({ items }: { items: { name: string; score: number; sub?: ReactNode }[] }) {
  return (
    <div className="sb18">
      {items.map((x, i) => (
        <div key={x.name} className="r" style={{ ['--c' as string]: genreColor(x.name), ['--w' as string]: `${Math.max(4, Math.min(100, (x.score / 5) * 100))}%`, ['--d' as string]: `${i * 70}ms` }}>
          <span className="n"><b>{x.name}</b>{x.sub != null && <small>{x.sub}</small>}</span>
          <span className="t" aria-hidden="true"><i /></span>
          <b className="v">{fmt1(x.score)}</b>
        </div>
      ))}
    </div>
  );
}

// How listening time splits between genres: one bar of coloured segments
// (each as long as its share) and a legend with the percentages big.
export function GenreMix({ items }: { items: { name: string; pct: number }[] }) {
  const total = items.reduce((s, x) => s + x.pct, 0) || 1;
  const parts = items.map((x) => ({ ...x, share: (x.pct / total) * 100 }));
  return (
    <div className="gm18">
      <div className="bar" aria-hidden="true">
        {parts.map((x, i) => <i key={x.name} style={{ ['--c' as string]: genreColor(x.name), flexGrow: x.share, ['--d' as string]: `${i * 80}ms` }} />)}
      </div>
      <div className="lg">
        {parts.map((x) => (
          <span key={x.name} style={{ ['--c' as string]: genreColor(x.name) }}>
            <b>{Math.round(x.share)}<small>%</small></b>
            <em>{x.name}</em>
          </span>
        ))}
      </div>
    </div>
  );
}

// One of six soft card colours, always the same for the same name (artist
// cards, fan clubs).
export function toneClass(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return `t-c${(Math.abs(h) % 6) + 1}`;
}

// The same tone as a colour value (for --tint and the like).
// (--s1…--s6: the tones at full strength, since --tint is mixed down to a
// plate.)
export function toneColor(key: string): string {
  return `var(--s${toneClass(key).slice(3)})`;
}

// Any block on a plate of a picture's colour (a vote candidate, …).
export function TintBox({ picture, fallbackKey, className = '', children }: { picture?: string | null; fallbackKey: string; className?: string; children: ReactNode }) {
  const tint = useImageColor(picture ? sizedImage(picture, 64) ?? picture : null);
  return <div className={`tn15 ${className}`.trim()} style={tintStyle(tint ?? toneColor(fallbackKey))}>{children}</div>;
}
