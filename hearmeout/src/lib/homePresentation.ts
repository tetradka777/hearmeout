export function listeningDayLabel(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function showListeningDay(day?: { trackCount: number; minutes: number; listeningMs?: number; range?: { start: string } }, today = listeningDayLabel()): boolean {
  if (!day || !day.trackCount || day.range?.start.slice(0, 10) !== today) return false;
  // Older persisted recaps only contain rounded minutes: 60 could mean
  // 59m30s. Wait for the measured answer rather than displaying it early.
  return day.listeningMs != null ? day.listeningMs >= 3600000 : day.minutes > 60;
}

export function loopPosition(left: number, cycle: number): number {
  if (cycle <= 0 || (left >= cycle && left < cycle * 2)) return left;
  return cycle + ((left - cycle) % cycle + cycle) % cycle;
}
