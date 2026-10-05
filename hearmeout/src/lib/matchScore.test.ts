import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeMatch } from './matchScore';

const a = [{ g: 'Rock', pct: 50 }, { g: 'Pop', pct: 30 }, { g: 'Jazz', pct: 20 }];
const b = [{ g: 'Rock', pct: 40 }, { g: 'Electronic', pct: 35 }, { g: 'Pop', pct: 25 }];

test('symmetric', () => assert.equal(computeMatch(a, b), computeMatch(b, a)));
test('identical profiles match 100%', () => assert.equal(computeMatch(a, a), 100));
test('no shared genres match 0%', () => assert.equal(computeMatch([{ g: 'Rock', pct: 100 }], [{ g: 'Jazz', pct: 100 }]), 0));
test('no data on either side is "not enough", not 0', () => {
  assert.equal(computeMatch([], b), null);
  assert.equal(computeMatch(a, []), null);
});
