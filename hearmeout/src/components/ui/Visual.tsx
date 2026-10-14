'use client';

import type { ReactNode } from 'react';
import { userAvatarStyle } from '@/lib/format';
import { CoverArt } from './CoverArt';
import { ArtistName } from './ArtistName';
import { Initial } from './Initial';

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
export function CoverWall({ items, small }: { items: WallItem[]; small?: boolean }) {
  return (
    <div className={`cw15${small ? ' sm' : ''}`}>
      {items.map((it) => (
        <div className="it" key={it.key}>
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
      ))}
    </div>
  );
}

export type PersonItem = { id: string; name: string; avatarUrl: string | null; value?: ReactNode; sub?: ReactNode; onClick?: () => void; action?: ReactNode };

// People as cards you swipe through: a big round photo, the name, one
// highlighted value (a match %, hours) and a line under it.
export function PersonCards({ people, grid }: { people: PersonItem[]; grid?: boolean }) {
  return (
    <div className={grid ? 'pc15 grid' : 'hrow pc15'}>
      {people.map((p) => (
        <div className="pcd" key={p.id}>
          <button className="pb" onClick={p.onClick} disabled={!p.onClick}>
            <span className="av" style={{ ...userAvatarStyle(p), backgroundSize: 'cover' }}>{!p.avatarUrl && <Initial name={p.name} />}</span>
            <b>{p.name}</b>
            {p.value != null && <span className="vl">{p.value}</span>}
            {p.sub && <small>{p.sub}</small>}
          </button>
          {p.action}
        </div>
      ))}
    </div>
  );
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
