'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { fetchTrackPreview, prefetchTrackPreview } from './deezer';
import { useApp } from './AppContext';
import { audioContext, loadAudio, unlockAudio } from './webAudio';

export type QueueTrack = { title: string; artist: string; cover?: string | null; albumId?: string | null; spotifyId?: string | null };

type Status = 'idle' | 'loading' | 'ready' | 'unavailable';

// The Spotify album a queue track belongs to: spotifyId is the album's, and
// a raw Spotify albumId works too (the server picks the exact recording).
function albumOf(track: QueueTrack): string | null {
  return track.spotifyId || (track.albumId && /^[0-9A-Za-z]{22}$/.test(track.albumId) ? track.albumId : null);
}

// Look a track up ahead of time so play starts without waiting.
export function prefetchQueueTrack(track: QueueTrack): void {
  prefetchTrackPreview(track.artist, track.title, albumOf(track));
}

type PlayerValue = {
  queue: QueueTrack[];
  index: number;
  playing: boolean;
  progress: number; // 0..1 of the current 30s preview (a few times a second)
  // The exact position right now: for the rings, which redraw every frame
  // without re-rendering anything.
  getProgress: () => number;
  status: Status;
  currentTrack: QueueTrack | null;
  // Playing without the mini-player (the recap's song of the period, which
  // has its own play button on the page).
  quiet: boolean;
  // loop: the same preview starts over when it ends (the recap's song).
  playQueue: (tracks: QueueTrack[], startIndex: number, opts?: { quiet?: boolean; loop?: boolean }) => void;
  toggle: () => void;
  next: () => void;
  close: () => void;
};

type AudioState = { buffer: AudioBuffer | null; source: AudioBufferSourceNode | null; startedAt: number; offset: number; loop: boolean };

// Stops the sound that is playing, without its "ended" handler running.
function stopSource(a: AudioState) {
  if (!a.source) return;
  a.source.onended = null;
  try { a.source.stop(); } catch { /* already stopped */ }
  a.source.disconnect();
  a.source = null;
}

const PlayerContext = createContext<PlayerValue | null>(null);

export function usePlayer(): PlayerValue {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer must be used within PlayerProvider');
  return ctx;
}

// Single global preview player, played through the Web Audio API
// (lib/webAudio: no system "Now Playing" player on an iPhone). Drives the
// docked mini-player and every play button; auto-advances through the
// queue when a preview ends, or starts it over when looping.
export function PlayerProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<QueueTrack[]>([]);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<Status>('idle');
  const [quiet, setQuiet] = useState(false);
  const requestToken = useRef(0);
  // The decoded preview, the sound playing it, and where it is: started
  // at `startedAt` (audio clock) or paused at `offset` seconds.
  const audio = useRef<AudioState>({ buffer: null, source: null, startedAt: 0, offset: 0, loop: false });

  const currentTrack = queue[index] ?? null;

  const advance = useCallback(() => {
    setIndex((i) => {
      if (i + 1 < queue.length) return i + 1;
      setPlaying(false);
      return i;
    });
  }, [queue.length]);
  const advanceRef = useRef(advance);
  useEffect(() => { advanceRef.current = advance; });

  // Starts the loaded preview at `from` seconds.
  const start = useCallback((from: number) => {
    const c = audioContext();
    const a = audio.current;
    if (!c || !a.buffer) return;
    stopSource(audio.current);
    if (c.state === 'suspended') c.resume().catch(() => {});
    const src = c.createBufferSource();
    src.buffer = a.buffer;
    // Looping (the recap's song): the same preview starts over by itself.
    src.loop = a.loop;
    src.connect(c.destination);
    src.onended = () => {
      // Only a preview that played to its end gets here (a pause or a new
      // track clears this first).
      a.source = null;
      a.offset = 0;
      setPlaying(false);
      setProgress(1);
      advanceRef.current();
    };
    src.start(0, from);
    a.source = src;
    a.startedAt = c.currentTime - from;
    a.offset = from;
    setPlaying(true);
  }, []);

  const position = useCallback(() => {
    const c = audioContext();
    const a = audio.current;
    if (!a.buffer) return 0;
    if (!a.source || !c) return a.offset;
    const t = c.currentTime - a.startedAt;
    return a.loop ? t % a.buffer.duration : Math.min(a.buffer.duration, t);
  }, []);

  const pause = useCallback(() => {
    const a = audio.current;
    if (!a.source) return;
    a.offset = position();
    stopSource(audio.current);
    setPlaying(false);
  }, [position]);

  useEffect(() => {
    const track = queue[index];
    if (!track) return;
    const myToken = ++requestToken.current;
    stopSource(audio.current);
    audio.current.buffer = null;
    audio.current.offset = 0;
    setPlaying(false);
    setStatus('loading');
    setProgress(0);
    fetchTrackPreview(track.artist, track.title, albumOf(track))
      .then(async (tr) => {
        if (requestToken.current !== myToken) return;
        if (!tr) {
          setStatus('unavailable');
          if (index + 1 < queue.length) advance();
          return;
        }
        const buffer = await loadAudio(tr.preview);
        if (requestToken.current !== myToken) return;
        audio.current.buffer = buffer;
        setStatus('ready');
        start(0);
      })
      .catch(() => { if (requestToken.current === myToken) setStatus('unavailable'); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue, index]);

  // A few times a second for the mini-player's time and anything else that
  // re-renders from `progress`.
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      const d = audio.current.buffer?.duration;
      if (d) setProgress(position() / d);
    }, 250);
    return () => clearInterval(id);
  }, [playing, position]);

  const playQueue = useCallback((tracks: QueueTrack[], startIndex: number, opts?: { quiet?: boolean; loop?: boolean }) => {
    unlockAudio(); // inside the tap that asked for it
    audio.current.loop = !!opts?.loop;
    setQuiet(!!opts?.quiet);
    setQueue(tracks);
    setIndex(Math.max(0, Math.min(startIndex, tracks.length - 1)));
  }, []);

  const toggle = useCallback(() => {
    if (!currentTrack || status !== 'ready') return;
    unlockAudio();
    if (audio.current.source) pause();
    else {
      const a = audio.current;
      start(a.buffer && a.offset >= a.buffer.duration - 0.05 ? 0 : a.offset);
    }
  }, [currentTrack, status, pause, start]);

  // Manual "Next" (prototype's mini-player, spec 3.18/B11) — same bounds
  // check as auto-advance-on-ended, just triggerable from a button too.
  const next = useCallback(() => advance(), [advance]);

  // "✕" close: clearing the queue drops `currentTrack` to null, which is
  // what both the mini-player and the shell's `hasmp` padding key off of.
  const close = useCallback(() => {
    requestToken.current++;
    stopSource(audio.current);
    audio.current.buffer = null;
    audio.current.offset = 0;
    audio.current.loop = false;
    setQueue([]);
    setIndex(0);
    setPlaying(false);
    setQuiet(false);
  }, []);

  // Leaving the site stops the music: switching to another tab or app, or
  // locking the phone, pauses it (the bar stays, so it can be resumed);
  // signing out clears the player.
  const pauseRef = useRef(pause);
  useEffect(() => { pauseRef.current = pause; });
  useEffect(() => {
    const onHide = () => { if (document.hidden) pauseRef.current(); };
    const pauseNow = () => pauseRef.current();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', pauseNow);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', pauseNow);
    };
  }, []);
  const { me } = useApp();
  const signedIn = !!me;
  useEffect(() => { if (!signedIn) close(); }, [signedIn, close]);

  const getProgress = useCallback(() => {
    const d = audio.current.buffer?.duration;
    return d ? Math.min(1, position() / d) : 0;
  }, [position]);

  const value = useMemo<PlayerValue>(() => ({
    queue, index, playing, progress, getProgress, status, currentTrack, quiet, playQueue, toggle, next, close,
  }), [queue, index, playing, progress, getProgress, status, currentTrack, quiet, playQueue, toggle, next, close]);

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}
