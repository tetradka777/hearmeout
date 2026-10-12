'use client';

// Home's recap card (prototype rev 8): big until you open that week's
// recap once, then a one-line strip. Remembered per device by the week's
// start date, so the next week's recap is "new" again.
const KEY = 'hmo-recap-seen';
export const RECAP_SEEN_EVENT = 'hmo-recap-seen';

export function recapSeenWeek(): string | null {
  try { return localStorage.getItem(KEY); } catch { return null; }
}

export function markRecapSeen(weekStart: string): void {
  try {
    if (localStorage.getItem(KEY) === weekStart) return;
    localStorage.setItem(KEY, weekStart);
  } catch {
    // Storage blocked: the card just stays big.
  }
  window.dispatchEvent(new CustomEvent(RECAP_SEEN_EVENT));
}
