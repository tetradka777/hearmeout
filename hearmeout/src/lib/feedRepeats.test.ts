import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateRepeatTracks, aggregateFriendsOnRepeat, type RepeatPlay } from './feedRepeats';

const play = (overrides: Partial<RepeatPlay> = {}): RepeatPlay => ({
  track_id: null, track_title: 'song', artist: 'artist', album_id: 'album',
  cover_url: 'cover', played_at: '2026-11-12T10:00:00Z', ...overrides,
});

test('returns only real repeats, ranked by count and then last play, with album metadata', () => {
  const rows = [play(), play({ played_at: '2026-11-12T11:00:00Z' }),
    play({ track_title: 'once' }), play({ track_title: 'newer' }),
    play({ track_title: 'newer', played_at: '2026-11-12T12:00:00Z' })];
  const result = aggregateRepeatTracks(rows);
  assert.deepEqual(result.map((r) => r.title), ['newer', 'song']);
  assert.deepEqual(result[1], { trackId: null, title: 'song', artist: 'artist',
    albumId: 'album', cover: 'cover', plays: 2, at: '2026-11-12T11:00:00Z' });
  assert.equal(aggregateRepeatTracks(rows, 1).length, 1);
  assert.deepEqual(aggregateRepeatTracks([]), []);
});

test('uses track ids and otherwise title, artist and album as identity', () => {
  assert.deepEqual(aggregateRepeatTracks([
    play({ track_id: 'a' }), play({ track_id: 'b' }),
    play({ artist: 'different artist' }), play({ album_id: 'different album' }),
  ]), []);
  const result = aggregateRepeatTracks([
    play({ track_id: 'a' }), play({ track_id: 'a', track_title: 'renamed' }),
    play({ track_title: '' }), play({ track_title: null }),
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].trackId, 'a');
  assert.equal(result[0].plays, 2);
});

test('friends repeats require two plays by one visible friend and exclude self or missing friends', () => {
  const user = { id: 'friend', name: 'friend', handle: 'friend', avatarUrl: null };
  const users = new Map([['friend', user], ['private', { ...user, id: 'private' }], ['me', { ...user, id: 'me' }]]);
  const rows = ['friend', 'friend', 'private', 'private', 'me', 'me', 'missing', 'missing']
    .map((user_id) => ({ ...play(), user_id }));
  const result = aggregateFriendsOnRepeat(rows, users, (id) => id !== 'private', 'me');
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].user, user);
  assert.equal(result[0].plays, 2);
  assert.deepEqual(aggregateFriendsOnRepeat([
    { ...play(), user_id: 'friend' }, { ...play(), user_id: 'private' },
  ], users, () => true, 'me'), []);
});
