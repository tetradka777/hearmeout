'use client';

import type { ReactNode } from 'react';
import { userAvatarStyle } from '@/lib/format';
import { CoverArt } from './CoverArt';
import { ArtistName } from './ArtistName';
import { Initial } from './Initial';
import { sizedImage } from '@/lib/imageSize';
import { tintStyle, useImageColor } from '@/lib/imageColor';

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
