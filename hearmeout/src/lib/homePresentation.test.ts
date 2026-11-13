import assert from 'node:assert/strict';
import { test } from 'node:test';
import { showListeningDay, loopPosition, listeningDayLabel } from './homePresentation';

test('day card requires a full measured hour, including rounded minute boundaries', () => {
  const range = { start: listeningDayLabel() + 'T00:00:00.000Z' };
  assert.equal(showListeningDay(undefined), false);
  assert.equal(showListeningDay({ range, trackCount: 20, minutes: 60, listeningMs: 3599999 }), false);
  assert.equal(showListeningDay({ range, trackCount: 20, minutes: 60, listeningMs: 3600000 }), true);
  assert.equal(showListeningDay({ range, trackCount: 0, minutes: 90, listeningMs: 5400000 }), false);
  assert.equal(showListeningDay({ range, trackCount: 20, minutes: 60 }), false);
  assert.equal(showListeningDay({ range, trackCount: 20, minutes: 61 }), true);
});

test('loop rebases both ends to the same logical position without growing its content', () => {
  for (const [left, expected] of [[999, 1999], [1000, 1000], [1700, 1700], [2000, 1000], [2500, 1500], [-100, 1900]]) {
    assert.equal(loopPosition(left, 1000), expected);
  }
  assert.equal(loopPosition(42, 0), 42);
});

test('yesterday cached listening cannot unlock the current day card', () => {
  assert.equal(showListeningDay({ trackCount: 50, minutes: 90, listeningMs: 5400000, range: { start: '2026-11-12T00:00:00.000Z' } }, '2026-11-13'), false);
});
