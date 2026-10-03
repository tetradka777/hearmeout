'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { fetchTrackPreview } from './deezer';

export type QueueTrack = { title: string; artist: string; cover?: string | null; albumId?: string | null; spotifyId?: string | null };

type Status = 'idle' | 'loading' | 'ready' | 'unavailable';

type PlayerValue = {
  queue: QueueTrack[];
  index: number;
  playing: boolean;
  progress: number; // 0..1 of the current 30s preview
  status: Status;
  currentTrack: QueueTrack | null;
  playQueue: (tracks: QueueTrack[], startIndex: number) => void;
  toggle: () => void;
  next: () => void;
  close: () => void;
};

const PlayerContext = createContext<PlayerValue | null>(null);

export function usePlayer(): PlayerValue {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer must be used within PlayerProvider');
  return ctx;
}

// Single global preview player — one <audio> element shared by both the
// mobile and desktop shells (which are both mounted at once), driving a
// docked transport bar instead of the old per-component CirclePlayer
// islands. Auto-advances through the queue when a preview ends.
export function PlayerProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<QueueTrack[]>([]);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<Status>('idle');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const requestToken = useRef(0);

  const currentTrack = queue[index] ?? null;

  const advance = useCallback(() => {
    setIndex((i) => {
      if (i + 1 < queue.length) return i + 1;
      setPlaying(false);
      return i;
    });
  }, [queue.length]);

  useEffect(() => {
    const track = queue[index];
    const audio = audioRef.current;
    if (!track || !audio) return;
    const myToken = ++requestToken.current;
    setStatus('loading');
    setProgress(0);
    fetchTrackPreview(track.artist, track.title)
      .then((tr) => {
        if (requestToken.current !== myToken) return;
        if (!tr) {
          setStatus('unavailable');
          if (index + 1 < queue.length) advance();
          return;
        }
        setStatus('ready');
        audio.src = tr.preview;
        audio.play().catch(() => {});
      })
      .catch(() => { if (requestToken.current === myToken) setStatus('unavailable'); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue, index]);

  const playQueue = useCallback((tracks: QueueTrack[], startIndex: number) => {
    setQueue(tracks);
    setIndex(Math.max(0, Math.min(startIndex, tracks.length - 1)));
  }, []);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack || status !== 'ready') return;
    if (audio.paused) audio.play().catch(() => {});
    else audio.pause();
  }, [currentTrack, status]);

  // Manual "Next" (prototype's mini-player, spec 3.18/B11) — same bounds
  // check as auto-advance-on-ended, just triggerable from a button too.
  const next = useCallback(() => advance(), [advance]);

  // "✕" close (spec 3.18/B11): the mini-player has no way to dismiss
  // itself today, so it stays docked until a full page reload. Clearing
  // the queue drops `currentTrack` to null, which is what both the
  // mini-player and the shell's `hasmp` bottom-padding key off of.
  const close = useCallback(() => {
    audioRef.current?.pause();
    setQueue([]);
    setIndex(0);
    setPlaying(false);
  }, []);

  const value = useMemo<PlayerValue>(() => ({
    queue, index, playing, progress, status, currentTrack, playQueue, toggle, next, close,
  }), [queue, index, playing, progress, status, currentTrack, playQueue, toggle, next, close]);

  return (
    <PlayerContext.Provider value={value}>
      {children}
      <audio
        ref={audioRef}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => advance()}
        onTimeUpdate={(e) => {
          const el = e.currentTarget;
          if (el.duration) setProgress(el.currentTime / el.duration);
        }}
      />
    </PlayerContext.Provider>
  );
}
