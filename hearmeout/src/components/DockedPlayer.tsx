'use client';

import { useRef } from 'react';
import { usePlayer } from '@/lib/PlayerContext';
import { ArtistName } from './ui/ArtistName';
import { useApp } from '@/lib/AppContext';
import { PreviewButton } from './redesign/PreviewButton';
import { NextIcon, CloseIcon } from './ui/Icons';
import { sizedImage } from '@/lib/imageSize';
import { useNextAlbum } from '@/lib/useNextAlbum';

function formatTime(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  return `0:${Math.floor(sec).toString().padStart(2, '0')}`;
}

const SWIPE = 56;   // px to switch the track
const FLICK = 0.35; // or a fast flick, px/ms (from 24px)

// The global preview mini-player (spec 13.1, Appendix A .mplay): one bar,
// mounted once (in #plhost, outside the route outlet) so it survives
// every navigation. On a phone it slides out of the bottom menu as its top
// part (.dock24 in the shell); `shown` is false while the playing track's
// own play button is on screen — then the bar folds away. Swipe it left
// for the next track, right for the one before; after the album's last
// track the next album follows (useNextAlbum). Tapping the track opens its
// album.
export function GlobalPlayer({ shown = true }: { shown?: boolean }) {
  const { t, openAlbum } = useApp();
  const { currentTrack, quiet, status, progress, queue, index, next, prev, close, playQueue } = usePlayer();
  const atEnd = queue.length > 0 && index >= queue.length - 1;
  const nextAlbum = useNextAlbum(currentTrack, atEnd);
  const bar = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; x: number; y: number; t: number; dx: number; axis: 'x' | 'y' | null } | null>(null);
  const swiped = useRef(false);
  // Quiet playback (the recap's song of the period) has no bar.
  if (!currentTrack || quiet) return null;
  const openSpotifyUrl = currentTrack.spotifyId ? `https://open.spotify.com/album/${currentTrack.spotifyId}` : null;
  const elapsed = formatTime(progress * 30);
  // Next track, or the next album after the last one; false when there's none.
  const forward = () => {
    if (!atEnd) { next(); return true; }
    const list = nextAlbum();
    if (!list) return false;
    playQueue(list, 0);
    return true;
  };
  const albumId = currentTrack.albumId || currentTrack.spotifyId || null;

  const move = (dx: number, animate: boolean) => {
    const el = bar.current;
    if (!el) return;
    el.style.transition = animate ? 'transform .25s ease, opacity .25s ease' : 'none';
    el.style.transform = dx ? `translateX(${dx}px)` : '';
    el.style.opacity = dx ? String(Math.max(0.35, 1 - Math.abs(dx) / 260)) : '';
  };
  const onDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), dx: 0, axis: null };
    swiped.current = false;
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.axis) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      d.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (d.axis === 'x') { swiped.current = true; bar.current?.setPointerCapture(e.pointerId); }
    }
    if (d.axis !== 'x') return;
    d.dx = dx;
    move(Math.max(-120, Math.min(120, dx * 0.7)), false);
  };
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.id !== e.pointerId || d.axis !== 'x') return;
    const speed = Math.abs(d.dx) / Math.max(1, performance.now() - d.t);
    const go = Math.abs(d.dx) >= SWIPE || (Math.abs(d.dx) >= 24 && speed >= FLICK);
    if (!go) { move(0, true); return; }
    const dir = d.dx < 0 ? -1 : 1;
    // Out to the side, the track changes, back in from the other side.
    move(dir * 160, true);
    setTimeout(() => {
      if (dir < 0) { if (!forward()) { move(0, true); return; } } else prev();
      move(-dir * 60, false);
      requestAnimationFrame(() => move(0, true));
    }, 180);
  };

  return (
    <div id="plhost" className={shown ? 'on' : 'off'} aria-hidden={!shown}>
      <div className="pls">
        <div
          ref={bar}
          className="mplay"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          // A swipe isn't also a tap on whatever it started on.
          onClickCapture={(e) => { if (swiped.current) { e.preventDefault(); e.stopPropagation(); swiped.current = false; } }}
        >
          <div className="mp-np" role={albumId ? 'button' : undefined} tabIndex={albumId ? 0 : undefined} aria-label={albumId ? t('player.openAlbum') : undefined}
            onClick={albumId ? () => openAlbum(albumId) : undefined}
            onKeyDown={albumId ? (e) => { if (e.key === 'Enter') openAlbum(albumId); } : undefined}>
            <div className="cov" style={{ width: 40, height: 40, flex: 'none', ...(currentTrack.cover ? { backgroundImage: `url('${sizedImage(currentTrack.cover, 40)}')`, backgroundSize: 'cover' } : {}) }} />
            <div className="mp-tt">
              <b>{currentTrack.title}</b>
              <small><ArtistName name={currentTrack.artist} albumId={currentTrack.spotifyId || currentTrack.albumId} size={16} /></small>
            </div>
          </div>
          <div className="mp-ctl">
            <PreviewButton tracks={[currentTrack]} size={46} />
            <span className="mp-time">{status === 'unavailable' ? t('player.unavailable') : `${elapsed} / 0:30`}</span>
          </div>
          <div className="mp-act">
            <button className="ib" onClick={() => forward()} aria-label={t('player.next')}><NextIcon /></button>
            {openSpotifyUrl && <a className="btn ghost sp" href={openSpotifyUrl} target="_blank" rel="noreferrer">{t('album.openInSpotify')}</a>}
            <button className="ib" onClick={close} aria-label={t('player.close')}><CloseIcon /></button>
          </div>
        </div>
      </div>
    </div>
  );
}
