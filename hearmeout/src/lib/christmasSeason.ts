/** The visitor's local calendar: November 15 through January 7 inclusive. */
export function christmasSeasonActive(date = new Date()): boolean {
  const month = date.getMonth();
  return month === 11 || (month === 10 && date.getDate() >= 15) || (month === 0 && date.getDate() <= 7);
}

export function nextLocalMidnight(date = new Date()): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
}

// No interval and no network: recheck at local midnight or after returning
// to a sleeping tab. A timer uses local dates so DST doesn't shift the boundary.
export function subscribeChristmasSeason(changed: () => void): () => void {
  let timer: ReturnType<typeof setTimeout>;
  const check = () => {
    clearTimeout(timer);
    changed();
    timer = setTimeout(check, Math.max(1, nextLocalMidnight().getTime() - Date.now()));
  };
  check();
  window.addEventListener('pageshow', check);
  document.addEventListener('visibilitychange', check);
  return () => {
    clearTimeout(timer);
    window.removeEventListener('pageshow', check);
    document.removeEventListener('visibilitychange', check);
  };
}
