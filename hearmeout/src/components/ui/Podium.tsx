'use client';

import type { CSSProperties, ReactNode } from 'react';
import { usePersonColor } from './Visual';
import { tintStyle } from '@/lib/imageColor';

export type PodiumEntry = {
  key: string;
  name: string;
  value: string;
  avatar: { style?: CSSProperties; letter?: ReactNode };
  you?: boolean;
  onClick?: () => void;
  // Whose step it is: the step takes their colour.
  person?: { id: string; name: string; avatarUrl: string | null };
};

// A step in its person's colour (their photo's, or their tone).
function Step({ e, rank }: { e: PodiumEntry; rank: number }) {
  const color = usePersonColor(e.person ?? { id: e.key, name: e.name, avatarUrl: null });
  return <span className="st13 tn15" style={tintStyle(color)}><span className="rk13">{rank}</span></span>;
}

// The top three on steps: first in the middle and highest, second on the
// left, third on the right, each with their photo, name and figure.
export function Podium({ entries, label }: { entries: PodiumEntry[]; label: string }) {
  const top = entries.slice(0, 3);
  const order = [top[1], top[0], top[2]];
  return (
    <div className="pod13" role="list" aria-label={label}>
      {order.map((e, i) => {
        const rank = i === 1 ? 1 : i === 0 ? 2 : 3;
        if (!e) return <span key={`empty${rank}`} className={`pd13 p${rank} empty`} aria-hidden="true"><span className="st13" /></span>;
        const body = (
          <>
            <span className="av13" style={e.avatar.style}>{e.avatar.letter}{rank === 1 && <i className="ic ic-medal cr13" aria-hidden="true" />}</span>
            <b className="nm13">{e.name}</b>
            <small className="vl13">{e.value}</small>
            <Step e={e} rank={rank} />
          </>
        );
        return e.onClick
          ? <button key={e.key} role="listitem" className={`pd13 p${rank}${e.you ? ' you' : ''}`} onClick={e.onClick}>{body}</button>
          : <span key={e.key} role="listitem" className={`pd13 p${rank}${e.you ? ' you' : ''}`}>{body}</span>;
      })}
    </div>
  );
}

type Who = { id: string; name: string; avatarUrl: string | null };

// A leaderboard card over the colours of its top three: each one's glow
// behind their place on the podium (second left, first middle, third
// right). Styles: rev15.css .lb19.
export function LeaderboardTile({ people, className = '', children }: { people: (Who | null)[]; className?: string; children: ReactNode }) {
  const c1 = usePersonColor(people[0] ?? { id: 'lb1', name: '1', avatarUrl: null });
  const c2 = usePersonColor(people[1] ?? { id: 'lb2', name: '2', avatarUrl: null });
  const c3 = usePersonColor(people[2] ?? { id: 'lb3', name: '3', avatarUrl: null });
  const style = { ['--l1' as string]: c1, ['--l2' as string]: people[1] ? c2 : c1, ['--l3' as string]: people[2] ? c3 : people[1] ? c2 : c1 } as CSSProperties;
  return <div className={`tile lb10 lb19 ${className}`.trim()} style={style}>{children}</div>;
}

// Two people's colours from one side of a card to the other (a pair that
// matches best, a duel). Styles: rev15.css .pt19.
export function PairTile({ a, b, className = '', children }: { a: Who | null; b: Who | null; className?: string; children: ReactNode }) {
  const ca = usePersonColor(a ?? { id: 'pa', name: 'a', avatarUrl: null });
  const cb = usePersonColor(b ?? { id: 'pb', name: 'b', avatarUrl: null });
  const style = { ['--g1' as string]: ca, ['--g2' as string]: cb } as CSSProperties;
  return <div className={`tile pt19 ${className}`.trim()} style={style}>{children}</div>;
}
