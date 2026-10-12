'use client';

import { useEffect, useRef } from 'react';
import { usePlayer, type QueueTrack } from '@/lib/PlayerContext';
import { useApp } from '@/lib/AppContext';

// The 30-second preview control (spec 7.3, 14 #7): a 60px ring, progress
// arc filling over 30s, triangle that becomes a 3-bar equalizer while
// playing. Driven by the existing PlayerContext (unchanged) — this is a
// new look on the same global player, not a new player.
const RADIUS = 26;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function PreviewButton({ tracks, index = 0, size = 60 }: { tracks: QueueTrack[]; index?: number; size?: number }) {
  const { t } = useApp();
  const { currentTrack, playing, progress, getProgress, toggle, playQueue } = usePlayer();
  const ring = useRef<SVGCircleElement>(null);
  const track = tracks[index];
  const isCurrent = !!track && currentTrack?.title === track.title && currentTrack?.albumId === track.albumId;
  const isPlaying = isCurrent && playing;
  const offset = CIRCUMFERENCE * (1 - (isCurrent ? progress : 0));
  // While playing, the arc follows the audio every frame (the player's own
  // progress only updates a few times a second, which made it jump).
  useEffect(() => {
    const el = ring.current;
    if (!el) return;
    // Paused: held exactly where the sound stopped; not this track: back
    // to the rendered value.
    if (!isPlaying) { el.style.strokeDashoffset = isCurrent ? String(CIRCUMFERENCE * (1 - getProgress())) : ''; return; }
    let raf = 0;
    const draw = () => {
      el.style.strokeDashoffset = String(CIRCUMFERENCE * (1 - getProgress()));
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [isPlaying, isCurrent, getProgress]);
  // Where frames aren't drawn (a background tab), the player's own updates
  // still move it.
  useEffect(() => {
    if (isPlaying && ring.current) ring.current.style.strokeDashoffset = String(CIRCUMFERENCE * (1 - getProgress()));
  }, [progress, isPlaying, getProgress]);

  return (
    <button
      className={`pvbtn${isPlaying ? ' playing' : ''}`}
      style={{ width: size, height: size }}
      onClick={() => (isCurrent ? toggle() : playQueue(tracks, index))}
      aria-label={isPlaying ? t('player.pausePreview') : t('player.playPreview')}
    >
      <svg viewBox="0 0 60 60">
        <circle className="trk" cx="30" cy="30" r={RADIUS} />
        <circle ref={ring} className="prg" cx="30" cy="30" r={RADIUS} strokeDasharray={CIRCUMFERENCE} strokeDashoffset={offset} />
      </svg>
      <span className="ic">
        {isPlaying ? (
          <span className="eq"><b /><b /><b /></span>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
        )}
      </span>
    </button>
  );
}
