'use client';

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
  const { currentTrack, playing, progress, toggle, playQueue } = usePlayer();
  const track = tracks[index];
  const isCurrent = !!track && currentTrack?.title === track.title && currentTrack?.albumId === track.albumId;
  const isPlaying = isCurrent && playing;
  const offset = CIRCUMFERENCE * (1 - (isCurrent ? progress : 0));

  return (
    <button
      className={`pvbtn${isPlaying ? ' playing' : ''}`}
      style={{ width: size, height: size }}
      onClick={() => (isCurrent ? toggle() : playQueue(tracks, index))}
      aria-label={isPlaying ? t('player.pausePreview') : t('player.playPreview')}
    >
      <svg viewBox="0 0 60 60">
        <circle className="trk" cx="30" cy="30" r={RADIUS} />
        <circle className="prg" cx="30" cy="30" r={RADIUS} strokeDasharray={CIRCUMFERENCE} strokeDashoffset={offset} />
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
