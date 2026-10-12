import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoutAward, stuckAward, type AwardEvent } from './monthAwards';

const users = new Map(['a', 'b', 'c'].map((id) => [id, { id, name: id, handle: id, avatarUrl: null }] as const));
const play = (user_id: string, played_at: string, extra: Partial<AwardEvent>): AwardEvent =>
  ({ user_id, played_at, duration_ms: 180000, genre: null, ...extra });

test('scout: first listener of an album others played later', () => {
  const events = [
    play('a', '2026-10-01T10:00:00Z', { album_id: 'x' }),
    play('b', '2026-10-03T10:00:00Z', { album_id: 'x' }),
    play('a', '2026-10-02T10:00:00Z', { album_id: 'y' }),
    play('c', '2026-10-02T12:00:00Z', { album_id: 'y' }),
    play('b', '2026-10-01T09:00:00Z', { album_id: 'z' }), // nobody else heard it
    play('c', '2026-10-05T10:00:00Z', { album_id: 'w' }),
    play('a', '2026-10-05T10:30:00Z', { album_id: 'w' }), // listened together: no scout
  ];
  assert.deepEqual(scoutAward(events, users), { label: 'awardScout', winner: users.get('a'), detail: '2' });
  assert.equal(scoutAward(events.slice(4), users), null);
});

test('stuck: most plays of one track, at least five', () => {
  const t = (user: string, track: string, n: number) =>
    Array.from({ length: n }, (_, i) => play(user, `2026-10-0${1 + (i % 9)}T10:00:00Z`, { track_id: track, track_title: track.toUpperCase() }));
  assert.deepEqual(stuckAward([...t('a', 's1', 4), ...t('b', 's2', 6), ...t('c', 's3', 5)], users),
    { label: 'awardStuck', winner: users.get('b'), detail: 'S2 · 6×' });
  assert.equal(stuckAward(t('a', 's1', 4), users), null);
});
