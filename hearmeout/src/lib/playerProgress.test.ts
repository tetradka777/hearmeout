import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPlayerProgress } from './playerProgress';

test('progress subscriptions preserve seek/reset and unsubscribe without redundant notifications', () => {
  const progress = createPlayerProgress();
  let notifications = 0;
  const stop = progress.subscribe(() => { notifications++; });
  assert.equal(progress.getSnapshot(), 0);
  progress.set(0.2);
  assert.equal(progress.getSnapshot(), 0.2);
  progress.set(0.2);
  assert.equal(notifications, 1);
  progress.set(0.8);
  progress.set(0);
  assert.equal(progress.getSnapshot(), 0);
  assert.equal(notifications, 3);
  stop();
  progress.set(0.4);
  assert.equal(notifications, 3);
});

test('progress clamps invalid audio positions', () => {
  const progress = createPlayerProgress();
  progress.set(2);
  assert.equal(progress.getSnapshot(), 1);
  progress.set(-1);
  assert.equal(progress.getSnapshot(), 0);
  progress.set(Number.NaN);
  assert.equal(progress.getSnapshot(), 0);
});
