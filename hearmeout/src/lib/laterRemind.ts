'use client';

import { peekJson } from './cachedJson';
import type { LaterItem, LaterRepeat } from './types';

// "Remind me" for listen-later items (migration 035): the picker opens
// through this event — right after something is saved, or from the bell on
// the Listen later page — and components/LaterReminder.tsx shows it.
export const LATER_REMIND_EVENT = 'hmo:later-remind';

export type RemindTarget = Pick<LaterItem, 'id' | 'type' | 'title' | 'artist' | 'cover' | 'remindAt' | 'remindEvery'>;

export function openLaterReminder(item: RemindTarget): void {
  window.dispatchEvent(new CustomEvent<RemindTarget>(LATER_REMIND_EVENT, { detail: item }));
}

// Only once the database has the columns (GET /api/later says so).
export function laterRemindReady(): boolean {
  return !!peekJson<{ remindReady?: boolean }>('/api/later')?.remindReady;
}

export type Preset = 'hour' | 'tonight' | 'tomorrow' | 'weekend' | 'nextWeek';

// Ready-made times, in the viewer's own clock. "tonight" only while it's
// still before 19:30.
export function presetTime(p: Preset, now = new Date()): Date | null {
  const d = new Date(now);
  d.setSeconds(0, 0);
  if (p === 'hour') { d.setMinutes(d.getMinutes() + 60); return d; }
  if (p === 'tonight') {
    if (now.getHours() * 60 + now.getMinutes() >= 19 * 60 + 30) return null;
    d.setHours(20, 0); return d;
  }
  if (p === 'tomorrow') { d.setDate(d.getDate() + 1); d.setHours(9, 0); return d; }
  if (p === 'weekend') {
    // The coming Saturday (next week's, if it's already the weekend).
    const add = ((6 - d.getDay() + 7) % 7) || 7;
    d.setDate(d.getDate() + add); d.setHours(11, 0); return d;
  }
  const add = ((1 - d.getDay() + 7) % 7) || 7; // next Monday
  d.setDate(d.getDate() + add); d.setHours(19, 0); return d;
}

// <input type="datetime-local"> wants local "YYYY-MM-DDTHH:mm".
export function toLocalInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export async function saveLaterReminder(id: number, at: Date | null, every: LaterRepeat | null): Promise<'ok' | 'not_ready' | 'error'> {
  const res = await fetch(`/api/later/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ remindAt: at ? at.toISOString() : null, every: at ? every : null }),
  }).catch(() => null);
  if (!res) return 'error';
  if (res.status === 503) return 'not_ready';
  return res.ok ? 'ok' : 'error';
}
