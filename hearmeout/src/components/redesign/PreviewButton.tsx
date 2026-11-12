'use client';

import { useEffect, useRef } from 'react';
import { prefetchQueueTrack, trackKey, usePlayer, type QueueTrack } from '@/lib/PlayerContext';
import { useApp } from '@/lib/AppContext';

// The 30-second preview control (spec 7.3, 14 #7): a 60px ring, progress
// arc filling over 30s, triangle that becomes a 3-bar equalizer while
// playing. Driven by the existing PlayerContext (unchanged) — this is a
// new look on the same global player, not a new player.
const RADIUS = 26;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

// Keep audio ticks outside React. Hidden copies of the current song retain
// their state, but only a visible ring draws animation frames.
function usePreviewRing(isCurrent: boolean, isPlaying: boolean) {
  const { getProgress, subscribeProgress } = usePlayer();
  const ring = useRef<SVGCircleElement>(null);
  useEffect(() => {
    const el = ring.current;
    if (!el) return;
    if (!isCurrent) { el.style.strokeDashoffset = String(CIRCUMFERENCE); return; }
    let frame = 0;
    let visible = false;
    const draw = () => {
      frame = 0;
      if (!visible || document.hidden) return;
      el.style.strokeDashoffset = String(CIRCUMFERENCE * (1 - getProgress()));
      if (isPlaying) frame = requestAnimationFrame(draw);
    };
    const update = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      draw();
    };
    const observer = new IntersectionObserver(entries => {
      visible = entries.some(entry => entry.isIntersecting);
      update();
    });
    observer.observe(el);
    const stop = subscribeProgress(() => { if (!isPlaying) update(); });
    document.addEventListener('visibilitychange', update);
    return () => {
      observer.disconnect(); stop();
      document.removeEventListener('visibilitychange', update);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [isCurrent, isPlaying, getProgress, subscribeProgress]);
  return ring;
}

export function PreviewButton({ tracks, index = 0, size = 60 }: { tracks: QueueTrack[]; index?: number; size?: number }) {
  const { t } = useApp();
  const { currentTrack, playing, toggle, playQueue } = usePlayer();
  const track = tracks[index];
  const isCurrent = !!track && currentTrack?.title === track.title && currentTrack?.albumId === track.albumId;
  const isPlaying = isCurrent && playing;
  const ring = usePreviewRing(isCurrent, isPlaying);

  return (
    <button
      className={`pvbtn${isPlaying ? ' playing' : ''}`}
      data-pl={track ? trackKey(track) : undefined}
      style={{ width: size, height: size }}
      onClick={() => (isCurrent ? toggle() : playQueue(tracks, index))}
      // The lookup starts at the touch (or hover), a moment before the click.
      onPointerEnter={() => { if (track && !isCurrent) prefetchQueueTrack(track); }}
      onPointerDown={() => { if (track && !isCurrent) prefetchQueueTrack(track); }}
      aria-label={isPlaying ? t('player.pausePreview') : t('player.playPreview')}
    >
      <svg viewBox="0 0 60 60">
        <circle className="trk" cx="30" cy="30" r={RADIUS} />
        <circle ref={ring} className="prg" cx="30" cy="30" r={RADIUS} strokeDasharray={CIRCUMFERENCE} strokeDashoffset={CIRCUMFERENCE} />
      </svg>
      <span className="pvi">
        {isPlaying ? (
          <span className="eq"><b /><b /><b /></span>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
        )}
      </span>
    </button>
  );
}

// Just the progress ring, to lay over any round play button (the recap's
// song): follows the track's preview every frame while it plays, holds
// where it paused, empty for any other track.
export function PlayRing({ track }: { track: { title: string; albumId?: string | null } }) {
  const { currentTrack, playing } = usePlayer();
  const isCurrent = currentTrack?.title === track.title && (currentTrack?.albumId ?? null) === (track.albumId ?? null);
  const isPlaying = isCurrent && playing;
  const ring = usePreviewRing(isCurrent, isPlaying);
  return (
    <svg className="prr15" viewBox="0 0 60 60" aria-hidden="true" data-pl={trackKey(track)}>
      <circle className="trk" cx="30" cy="30" r={RADIUS} />
      <circle ref={ring} className="prg" cx="30" cy="30" r={RADIUS} strokeDasharray={CIRCUMFERENCE} strokeDashoffset={CIRCUMFERENCE} />
    </svg>
  );
}
