import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLoopMotion } from './loopMotion';

test('loop never rebases a moving gesture and settles once after scrolling stops', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const writes: number[] = [];
  const motion = createLoopMotion(() => ({ left: 2100, cycle: 1000 }), value => writes.push(value));
  motion.start(); motion.scroll(); t.mock.timers.tick(500); motion.settle();
  assert.deepEqual(writes, []);
  motion.end(); t.mock.timers.tick(100); motion.scroll(); t.mock.timers.tick(150);
  assert.deepEqual(writes, []);
  t.mock.timers.tick(100); assert.deepEqual(writes, [1100]);
  motion.stop();
});

test('cleanup cancels pending work and a settled middle cycle does not move', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const writes: number[] = [];
  const motion = createLoopMotion(() => ({ left: 1400, cycle: 1000 }), value => writes.push(value));
  motion.settle(); motion.scroll(); motion.stop(); t.mock.timers.tick(500);
  assert.deepEqual(writes, []);
});
