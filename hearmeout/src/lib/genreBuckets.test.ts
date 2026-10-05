import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bucketForGenres } from './genreBuckets';

test('maps Spotify genres to catalog buckets, specific rules first', () => {
  const cases: [string[], string | null][] = [
    [['art rock'], 'Rock'], [['latin pop'], 'Latin'], [['trap latino'], 'Latin'], [['pop rap'], 'Hip-Hop'],
    [['dance pop'], 'Pop'], [['uk garage'], 'Electronic'], [['neo soul'], 'R&B'], [['russian hip hop'], 'Hip-Hop'],
    [['k-pop'], 'Pop'], [['classical'], null], [[], null], [['classical', 'indie folk'], 'Rock'],
  ];
  for (const [genres, want] of cases) assert.equal(bucketForGenres(genres), want, JSON.stringify(genres));
});
