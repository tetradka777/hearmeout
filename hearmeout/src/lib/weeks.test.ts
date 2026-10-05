import { test } from 'node:test';
import assert from 'node:assert/strict';
import { completedWeekRange, isoWeekNumber } from './weeks';

const day = (d: Date) => d.toISOString().slice(0, 10);

test('latest completed week, Monday start (spec 6.12 example)', () => {
  // Monday 28 Sep 2026 → week 39, 21–27 Sep.
  const { start, end } = completedWeekRange(0, 'mon', new Date('2026-09-28T10:00:00Z'));
  assert.equal(day(start), '2026-09-21');
  assert.equal(day(end), '2026-09-28');
  assert.equal(isoWeekNumber(start), 39);
});

test('mid-week and on Sunday the latest week is still the previous one', () => {
  assert.equal(day(completedWeekRange(0, 'mon', new Date('2026-10-01T12:00:00Z')).start), '2026-09-21');
  assert.equal(day(completedWeekRange(0, 'mon', new Date('2026-10-04T23:00:00Z')).start), '2026-09-21');
});

test('Sunday week start and older offsets', () => {
  const { start } = completedWeekRange(0, 'sun', new Date('2026-09-28T10:00:00Z'));
  assert.equal(day(start), '2026-09-20');
  assert.equal(day(completedWeekRange(-4, 'mon', new Date('2026-09-28T10:00:00Z')).start), '2026-08-24');
});

test('ISO week numbers around the new year', () => {
  assert.equal(isoWeekNumber(new Date('2026-12-28T00:00:00Z')), 53); // 2026 has 53 ISO weeks
  assert.equal(isoWeekNumber(new Date('2027-01-04T00:00:00Z')), 1);
  assert.equal(isoWeekNumber(new Date('2025-12-29T00:00:00Z')), 1); // week 1 of 2026
});
