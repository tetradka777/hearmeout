'use client';

import { usePlayer } from '@/lib/PlayerContext';
import { useApp } from '@/lib/AppContext';
import { PreviewButton } from './redesign/PreviewButton';
import { NextIcon, CloseIcon } from './ui/Icons';

function formatTime(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  return `0:${Math.floor(sec).toString().padStart(2, '0')}`;
}

// The global preview mini-player (spec 13.1, Appendix A .mplay): one bar,
// mounted once (in #plhost, outside the route outlet) so it survives
// every navigation. Same PlayerContext as before — only the look is new,
// replacing the old DockedPlayerDesktop/DockedPlayerMobile split (CSS
// breakpoints already handle desktop vs. mobile layout for one markup).
export function GlobalPlayer() {
  const { t } = useApp();
  const { currentTrack, status, progress, next, close } = usePlayer();
  if (!currentTrack) return null;
  const openSpotifyUrl = currentTrack.spotifyId ? `https://open.spotify.com/album/${currentTrack.spotifyId}` : null;
  const elapsed = formatTime(progress * 30);

  return (
    <div id="plhost">
      <div className="mplay">
        <div className="mp-np">
          <div className="cov" style={{ width: 40, height: 40, flex: 'none', ...(currentTrack.cover ? { backgroundImage: `url('${currentTrack.cover}')`, backgroundSize: 'cover' } : {}) }} />
          <div className="mp-tt">
            <b>{currentTrack.title}</b>
            <small>{currentTrack.artist}</small>
          </div>
        </div>
        <div className="mp-ctl">
          <PreviewButton tracks={[currentTrack]} size={46} />
          <span className="mp-time">{status === 'unavailable' ? t('player.unavailable') : `${elapsed} / 0:30`}</span>
        </div>
        <div className="mp-act">
          <button className="ib" onClick={next} aria-label={t('player.next')}><NextIcon /></button>
          {openSpotifyUrl && <a className="btn ghost sp" href={openSpotifyUrl} target="_blank" rel="noreferrer">{t('album.openInSpotify')}</a>}
          <button className="ib" onClick={close} aria-label={t('player.close')}><CloseIcon /></button>
        </div>
      </div>
    </div>
  );
}
