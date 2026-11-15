import assert from 'node:assert/strict';
import { test } from 'node:test';
import { qualifyingRepeats } from './repeatSelection';

test('repeat shelves require four distinct tracks with at least two actual plays', () => {
  const tracks = Array.from({ length: 4 }, (_, i) => ({ trackId: String(i), title: 'song '+i, artist: 'artist', plays: 2 }));
  assert.deepEqual(qualifyingRepeats(tracks.slice(0, 3)), []);
  assert.equal(qualifyingRepeats(tracks).length, 4);
  assert.deepEqual(qualifyingRepeats([...tracks.slice(0, 3), { ...tracks[3], plays: 1 }]), []);
  assert.deepEqual(qualifyingRepeats([...tracks.slice(0, 3), tracks[0]]), []);
});
