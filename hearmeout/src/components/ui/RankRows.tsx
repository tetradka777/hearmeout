'use client';

import { userAvatarStyle } from '@/lib/format';

export type RankRow = { id: string; name: string; avatarUrl: string | null; amount: number; value: string; you?: boolean };

// People ranked by an amount (hours, plays): place, face, name, a bar in
// your colour and the number — the leaderboards on the taste match, group
// and fan club pages (.tl23 in rev15.css). A row opens that person, except
// your own.
export function RankRows({ rows, onOpen, label }: { rows: RankRow[]; onOpen?: (id: string) => void; label?: string }) {
  const max = Math.max(0, ...rows.map((r) => r.amount));
  return (
    <ol className="tl23" aria-label={label}>
      {rows.map((r, i) => (
        <li key={r.id} className={r.you ? 'you' : undefined}>
          <button onClick={r.you || !onOpen ? undefined : () => onOpen(r.id)} disabled={r.you || !onOpen}>
            <span className="n">{i + 1}</span>
            <span className="avt" style={{ ...userAvatarStyle(r), backgroundSize: 'cover' }}>{!r.avatarUrl && r.name[0]?.toUpperCase()}</span>
            <span className="g">
              <b>{r.name}</b>
              <i style={{ width: `${max ? Math.max(4, Math.round((r.amount / max) * 100)) : 4}%` }} />
            </span>
            <span className="v">{r.value}</span>
          </button>
        </li>
      ))}
    </ol>
  );
}
