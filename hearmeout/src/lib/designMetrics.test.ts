import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { leadingAlbum, percentageShares } from './designMetrics';

test('recap album leader uses total listening time, like the existing top albums', () => {
  assert.deepEqual(leadingAlbum([
    { album_id: 'a', cover_url: 'a.jpg', duration_ms: 600000 },
    { album_id: 'b', cover_url: 'b.jpg', duration_ms: 120000 },
    { album_id: 'b', cover_url: null, duration_ms: 120000 },
    { album_id: null, cover_url: 'unknown.jpg', duration_ms: 900000 },
  ]), { albumId: 'a', cover: 'a.jpg', plays: 1 });
  assert.equal(leadingAlbum([]), null);
});

test('genre shares preserve order and total exactly 100 after rounding', () => {
  assert.deepEqual(percentageShares([1, 1, 1]), [34, 33, 33]);
  assert.deepEqual(percentageShares([28, 27, 24, 13, 8]), [28, 27, 24, 13, 8]);
  assert.deepEqual(percentageShares([]), []);
  assert.deepEqual(percentageShares([0, 0]), [0, 0]);
});
