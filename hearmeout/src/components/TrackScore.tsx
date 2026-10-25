'use client';

import { useEffect, useRef, useState } from 'react';
import { useApp } from '@/lib/AppContext';
import { fmt1 } from '@/lib/numberFormat';
import { StarSlider } from './redesign/Stars';

// A track's score in the album tracklist: your score (or a star to rate),
// your friends' average under it, and when open a slider that saves by
// itself a moment after you stop (like the now-playing bar).
export function TrackScoreButton({ mine, friends, open, onToggle }: { mine: number | null; friends: { avg: number; n: number } | null; open: boolean; onToggle: () => void }) {
  const { t } = useApp();
  return (
    <button className={`ts19${mine != null ? ' on' : ''}${open ? ' op' : ''}`} onClick={onToggle} aria-expanded={open} aria-label={mine != null ? t('track.yourScore', { score: fmt1(mine) }) : t('track.rate')}>
      <span className="v"><i className="ic ic-star" aria-hidden="true" />{mine != null ? fmt1(mine) : ''}</span>
      {friends && <small>{t('track.friendsAvg', { score: fmt1(friends.avg) })}</small>}
    </button>
  );
}

export function TrackScoreEditor({ albumId, trackNumber, title, mine, onSaved }: { albumId: string; trackNumber: number; title: string; mine: number | null; onSaved: () => void }) {
  const { t, showToast } = useApp();
  const [draft, setDraft] = useState(mine ?? 0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const send = async (stars: number | null) => {
    const res = await fetch('/api/track-ratings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ albumId, trackNumber, title, stars }),
    }).catch(() => null);
    if (!res?.ok) { showToast(t('track.saveFailed')); return; }
    onSaved();
  };
  const change = (v: number) => {
    setDraft(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => send(v), 700);
  };
  return (
    <div className="tse19">
      <StarSlider value={draft} onChange={change} size={26} />
      <b className="num">{draft ? fmt1(draft) : '–'}</b>
      {mine != null && <button className="btn ghost" onClick={() => { setDraft(0); send(null); }}>{t('track.clear')}</button>}
    </div>
  );
}
