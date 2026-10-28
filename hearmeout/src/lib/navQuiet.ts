'use client';

// Background loading steps aside while you move around: each screen you
// open marks the moment, and the background work waits until there's been
// a few seconds without one, so the opened screen's requests don't queue
// behind it on the small server.
const QUIET_MS = 5000;
let lastNav = 0;

export function markNav(): void {
  lastNav = Date.now();
}

export async function whenQuiet(): Promise<void> {
  for (;;) {
    const wait = lastNav + QUIET_MS - Date.now();
    if (wait <= 0) return;
    await new Promise((r) => setTimeout(r, wait));
  }
}
