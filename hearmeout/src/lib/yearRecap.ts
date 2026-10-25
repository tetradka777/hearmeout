// The year in review: open through December and January — December shows
// the year so far, January the year that just ended.
export function yearRecapOpen(now = new Date()): boolean {
  const m = now.getMonth();
  return m === 11 || m === 0;
}

// The recap offset for it: 0 = this year, -1 = last year (in January).
export function yearRecapOffset(now = new Date()): number {
  return now.getMonth() === 0 ? -1 : 0;
}

export function yearRecapYear(now = new Date()): number {
  return now.getFullYear() + yearRecapOffset(now);
}
