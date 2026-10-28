import test from 'node:test';
import assert from 'node:assert/strict';
import { nextReminder } from './laterReminders';

test('later reminders: next time after now', () => {
  const now = new Date('2026-10-28T12:00:00Z');
  assert.equal(nextReminder(new Date('2026-10-28T11:00:00Z'), null, now), null);
  assert.equal(nextReminder(new Date('2026-10-28T11:00:00Z'), 'day', now)?.toISOString(), '2026-10-29T11:00:00.000Z');
  // A server asleep for days sends one and skips to the next future time.
  assert.equal(nextReminder(new Date('2026-10-20T11:00:00Z'), 'week', now)?.toISOString(), '2026-11-03T11:00:00.000Z');
  assert.equal(nextReminder(new Date('2026-10-28T11:00:00Z'), 'month', now)?.getUTCMonth(), 10);
});
