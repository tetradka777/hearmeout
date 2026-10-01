'use client';

import { useApp } from '@/lib/AppContext';
import { Stars } from './Stars';

// The Toxic-only now-playing bar (spec 4.1, 7.9, 16.2/16.3): the account's
// own currently playing or last-played track, fixed at the bottom. Absent
// entirely in Cream Pop and when nothing has played — the extra bottom
// padding it needs (.hasnp on the shell root) follows the same rule.
export function NowPlayingBar() {
  const { me, t, myRatings, openRateFor } = useApp();
  const np = me?.nowPlaying;
  if (!np || me?.design !== 'toxic') return null;

  const existing = np.albumId ? myRatings.find((r) => r.albumId === np.albumId) : undefined;

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
          <Stars value={existing?.stars ?? 0} size={16} onDark />
          <span className="pl-hint">{t('player.nowPlaying')}</span>
        </div>
      )}
      {np.albumId && (
        <button className="btn" onClick={() => openRateFor(np.albumId!, 'history')}>
          {existing ? t('rate.changeRating') : t('player.rateIt')}
        </button>
      )}
    </div>
  );
}
