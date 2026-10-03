'use client';

import { useEffect, useRef, useState } from 'react';
import { useApp } from '@/lib/AppContext';
import { StarSlider } from './Stars';

// The now-playing bar (spec 4.1, 7.9, 15.1, 16.2/16.3): the account's own
// currently playing or last-played track, fixed at the bottom in both
// designs (redesign fix item 11 — this used to be Toxic-only). Absent
// entirely when nothing has played — the extra bottom padding it needs
// (.hasnp on the shell root) follows the same rule.
export function NowPlayingBar() {
  const { me, t, myRatings, openAlbum, publishRating } = useApp();
  const np = me?.nowPlaying;
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [draft, setDraft] = useState<{ albumId: string; stars: number } | null>(null);
  useEffect(() => () => { Object.values(timers.current).forEach(clearTimeout); }, []);
  if (!np) return null;

  const existing = np.albumId ? myRatings.find((r) => r.albumId === np.albumId) : undefined;
  const displayedStars = draft && draft.albumId === np.albumId ? draft.stars : existing?.stars ?? 0;

  // Drag-to-rate (prototype's nowPlayingHtml): shows the dragged value
  // immediately (StarSlider has no state of its own), but only publishes
  // 400ms after the last move — same debounce as onboarding's calibration
  // slider (redesign fix B7) — and preserves any existing review/tags/
  // privacy instead of wiping them.
  const rate = (albumId: string, v: number) => {
    setDraft({ albumId, stars: v });
    if (timers.current[albumId]) clearTimeout(timers.current[albumId]);
    timers.current[albumId] = setTimeout(
      () => publishRating(albumId, v, existing?.review ?? '', existing?.tags ?? [], existing?.isPrivate ?? false),
      400
    );
  };

  return (
    <div className="player">
      <div className="np">
        <div className="cov" style={{ width: 40, height: 40, flex: 'none', borderRadius: 10, ...(np.cover ? { backgroundImage: `url('${np.cover}')`, backgroundSize: 'cover' } : {}) }} />
        <div>
          <b>{np.title}</b>
          <small>{np.artist}</small>
        </div>
      </div>
      {np.albumId && (
        <div className="mid">
          <StarSlider value={displayedStars} onChange={(v) => rate(np.albumId!, v)} size={20} onDark />
          <span className="pl-hint">{t('player.dragToRate')}</span>
        </div>
      )}
      {np.albumId && (
        <button className="btn" onClick={() => openAlbum(np.albumId!)}>
          {existing ? t('rate.changeRating') : t('player.rateIt')}
        </button>
      )}
    </div>
  );
}
