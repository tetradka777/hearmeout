import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSwapMutation, swapView, swapTransitionError, type SwapRow } from './albumSwaps';

const a = '11111111-1111-1111-1111-111111111111';
const b = '22222222-2222-2222-2222-222222222222';
const album = { albumId: 'deezer:123', title: 'album', artist: 'artist', cover: '' };
const row: SwapRow = { id: a, user_a: a, user_b: b, album_a: album, album_b: album,
  note_a: 'a', note_b: 'b', score_a: 3.1, score_b: 4.2, reaction_a: 'mine', reaction_b: 'secret',
  finished_a: '2026-11-12T00:00:00Z', finished_b: null, created_at: '2026-11-12T00:00:00Z', completed_at: null, cancelled_at: null };
const users = [{ id: a, name: 'a', handle: 'a', avatar_url: null }, { id: b, name: 'b', handle: 'b', avatar_url: null }];

test('swap input validates actions, IDs, note and reaction bounds and tenths', () => {
  assert.ok(parseSwapMutation({ friendId: b, albumId: album.albumId }, true));
  assert.equal(parseSwapMutation({ friendId: 'bad', albumId: album.albumId }, true), null);
  for (const score of [0, 5.1, 1.11, NaN, Infinity, '3']) {
    assert.equal(parseSwapMutation({ id: a, action: 'finish', score, expectedReceivedAlbumId: album.albumId }), null);
  }
  for (const score of [0.1, 1.1, 3.7, 5]) assert.ok(parseSwapMutation({ id: a, action: 'finish', score, expectedReceivedAlbumId: album.albumId }));
  assert.equal(parseSwapMutation({ friendId: b, albumId: album.albumId, note: 'x'.repeat(501) }, true), null);
  assert.equal(parseSwapMutation({ id: a, action: 'finish', score: 2, reaction: 'x'.repeat(2001), expectedReceivedAlbumId: album.albumId }), null);
  assert.equal(parseSwapMutation({ id: a, action: 'oops' }), null);
  assert.equal(parseSwapMutation(null), null);
});

test('outcomes stay blind in both participant orientations until both finish', () => {
  const mine = swapView(row, a, users)!;
  assert.equal(mine.me.score, 3.1);
  assert.equal(mine.friend.score, null);
  assert.equal(mine.friend.reaction, null);
  assert.equal(mine.me.album?.albumId, album.albumId);
  const other = swapView(row, b, users)!;
  assert.equal(other.friend.score, null);
  assert.equal(other.friend.reaction, null);
  assert.equal(other.canReveal, false);
  const complete = swapView({ ...row, finished_b: row.finished_a, completed_at: row.finished_a }, b, users)!;
  assert.equal(complete.canReveal, true);
  assert.equal(complete.friend.score, 3.1);
  assert.equal(complete.friend.reaction, 'mine');
  assert.equal(swapView(row, 'outsider', users), null);
});

test('state rules freeze picks after either finish, require both picks, and reject replay', () => {
  assert.equal(swapTransitionError(row, b, 'pick'), 'swap_locked');
  assert.equal(swapTransitionError(row, a, 'finish', album.albumId), 'already_finished');
  assert.equal(swapTransitionError({ ...row, album_b: null }, b, 'finish', album.albumId), 'missing_album');
  assert.equal(swapTransitionError(row, b, 'finish', album.albumId), null);
  assert.equal(swapTransitionError(row, b, 'cancel'), null);
  assert.equal(swapTransitionError({ ...row, completed_at: row.finished_a }, b, 'cancel'), 'swap_closed');
  assert.equal(swapTransitionError({ ...row, cancelled_at: row.finished_a }, b, 'finish'), 'swap_closed');
  assert.equal(swapTransitionError(row, 'outsider', 'cancel'), 'forbidden');
});

test('finishing requires the explicit received album id the listener reviewed', () => {
  for (const expectedReceivedAlbumId of [undefined, null, '', '   ', 123, 'x'.repeat(161), 'album\u0000id']) {
    assert.equal(parseSwapMutation({ id: a, action: 'finish', score: 3, expectedReceivedAlbumId }), null);
  }
  assert.deepEqual(parseSwapMutation({ id: a, action: 'finish', score: 3, expectedReceivedAlbumId: ` ${album.albumId} ` }), {
    id: a, action: 'finish', score: 3, reaction: '', expectedReceivedAlbumId: album.albumId,
  });
});

test('a gift replaced before finish rejects stale scores in both participant orientations', () => {
  const otherAlbum = { ...album, albumId: 'another-album' };
  const before = { ...row, score_a: null, score_b: null, finished_a: null, finished_b: null };
  assert.equal(swapTransitionError(before, a, 'finish', album.albumId), null);
  assert.equal(swapTransitionError({ ...before, album_b: otherAlbum }, a, 'finish', album.albumId), 'album_changed');
  assert.equal(swapTransitionError({ ...before, album_a: otherAlbum }, b, 'finish', album.albumId), 'album_changed');
  // The sender's own album is not the album they are scoring.
  assert.equal(swapTransitionError({ ...before, album_a: otherAlbum }, a, 'finish', album.albumId), null);
  assert.equal(swapTransitionError({ ...before, album_b: otherAlbum }, b, 'finish', album.albumId), null);
});
