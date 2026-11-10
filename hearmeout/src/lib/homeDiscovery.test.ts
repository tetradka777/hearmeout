import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { uniqueDiscovery } from './homeDiscovery';

test('discovery excludes upper shelves and album editions and prioritizes one review', () => {
  const known = new Map([
    ['a', { title: 'Album', artist: 'Tyler, The Creator' }],
    ['b', { title: 'Elsewhere', artist: 'Someone' }],
  ]);
  const result = uniqueDiscovery([{ albumId: 'a', author: 1 }, { albumId: 'a', author: 2 }, { albumId: 'b', author: 3 }], [
    { title: 'Album (Deluxe)', artist: 'Tyler, The Creator' },
    { title: 'Elsewhere', artist: 'Someone' },
    { title: 'New', artist: 'Artist' },
    { title: 'NEW', artist: 'artist' },
  ], id => known.get(id), ['b'], [known.get('b')!]);
  assert.deepEqual(result.reviews, [{ albumId: 'a', author: 1 }]);
  assert.deepEqual(result.albums, [{ title: 'New', artist: 'Artist' }]);
});
