import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ratingStreak } from './streak';

const NOW = Date.parse('2026-10-25T18:00:00Z');

test('streak counts days in a row ending today or yesterday', () => {
  assert.deepEqual(ratingStreak(['2026-10-25T09:00:00Z', '2026-10-24T09:00:00Z', '2026-10-23T22:00:00Z'], 0, NOW), { days: 3, ratedToday: true });
  // Nothing today: yesterday's run still counts, today doesn't yet.
  assert.deepEqual(ratingStreak(['2026-10-24T09:00:00Z', '2026-10-23T09:00:00Z'], 0, NOW), { days: 2, ratedToday: false });
  // A gap before yesterday ends it.
  assert.deepEqual(ratingStreak(['2026-10-22T09:00:00Z'], 0, NOW), { days: 0, ratedToday: false });
});

test('streak days follow the time zone', () => {
  // 23:30 UTC on the 24th is already the 25th in Moscow (UTC+3, offset -180).
  assert.deepEqual(ratingStreak(['2026-10-24T23:30:00Z'], -180, NOW), { days: 1, ratedToday: true });
  assert.deepEqual(ratingStreak(['2026-10-24T23:30:00Z'], 0, NOW), { days: 1, ratedToday: false });
});
