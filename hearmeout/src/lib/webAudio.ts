'use client';

// Previews are played through the Web Audio API, not an <audio> element:
// on an iPhone a media element brings up the system "Now Playing" player
// (lock screen, Dynamic Island), which a 30-second preview shouldn't. The
// audio session is set to "playback" where Safari supports it, so the
// ringer switch doesn't silence it (a media element ignores that switch
// too). Deezer's preview files allow cross-origin reads.

type AudioSessionNavigator = Navigator & { audioSession?: { type: string } };

let ctx: AudioContext | null = null;

export function audioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    try { (navigator as AudioSessionNavigator).audioSession!.type = 'playback'; } catch { /* not supported */ }
    ctx = new Ctor();
  }
  return ctx;
}

// Must run inside a tap/click the first time (browsers start audio only
// from a user gesture); later calls are harmless.
export function unlockAudio(): void {
  const c = audioContext();
  if (!c) return;
  if (c.state === 'suspended') c.resume().catch(() => {});
  // iOS also wants a sound started in the gesture: a silent one.
  try {
    const src = c.createBufferSource();
    src.buffer = c.createBuffer(1, 1, 22050);
    src.connect(c.destination);
    src.start(0);
  } catch { /* fine */ }
}

// Unlock on any touch, click or key anywhere, so a preview that starts a
// moment later (the recap's song, after its data loads) can be heard.
// Safari on an iPhone only lets sound start when the finger lifts
// (touchend / click), not on pointerdown, and it may suspend the audio
// again after the phone was locked or another app played — so this keeps
// listening, and does the work only while the sound isn't running.
if (typeof window !== 'undefined') {
  const onGesture = () => {
    if (ctx && ctx.state === 'running') return;
    unlockAudio();
  };
  for (const type of ['pointerdown', 'touchend', 'click', 'keydown']) {
    window.addEventListener(type, onGesture, { capture: true, passive: true });
  }
}

// The file's bytes, fetched once (also ahead of time, to start instantly).
const bytes = new Map<string, Promise<ArrayBuffer>>();
const MAX_KEPT = 16;

export function prefetchAudio(url: string): Promise<ArrayBuffer> {
  let p = bytes.get(url);
  if (!p) {
    p = fetch(url).then((r) => {
      if (!r.ok) throw new Error(String(r.status));
      return r.arrayBuffer();
    });
    bytes.set(url, p);
    p.catch(() => bytes.delete(url));
    if (bytes.size > MAX_KEPT) bytes.delete(bytes.keys().next().value!);
  }
  return p;
}

export async function loadAudio(url: string): Promise<AudioBuffer> {
  const c = audioContext();
  if (!c) throw new Error('no audio');
  const data = await prefetchAudio(url);
  // decodeAudioData takes the buffer over, so it gets a copy.
  return await c.decodeAudioData(data.slice(0));
}
