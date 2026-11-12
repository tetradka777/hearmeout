import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { diaryInput, isDiaryDate, diaryReadAccess, diaryEntriesQuery, diaryOwnedQuery, diaryEntry } from './musicDiary';

const owner = '11111111-1111-4111-8111-111111111111';
const viewer = '22222222-2222-4222-8222-222222222222';
const valid = { albumId: 'album-1', moment: 'a quiet morning', note: '', listenedOn: '2024-02-29' };

test('diary validates real calendar dates, including leap years', () => {
  for (const date of ['2024-02-29', '2026-11-12', '2000-02-29']) assert.equal(isDiaryDate(date), true);
  for (const date of ['2025-02-29', '1900-02-29', '2026-04-31', '2026-00-01', '2026-13-01', '0000-01-01', '2026-1-01', '2026-11-12T00:00:00Z']) assert.equal(isDiaryDate(date), false, date);
});

test('diary defaults to private and validates trimmed text and enum bounds', () => {
  assert.deepEqual(diaryInput(valid), { ...valid, mood: null, visibility: 'private' });
  assert.equal(diaryInput({ ...valid, moment: 'x'.repeat(120), note: 'x'.repeat(2000) })?.moment.length, 120);
  for (const patch of [
    { moment: 'x'.repeat(121) }, { moment: '   ' }, { note: 'x'.repeat(2001) },
    { mood: 'angry' }, { visibility: 'public' }, { listenedOn: '2025-02-29' },
    { albumId: '' }, { albumId: 'a\nfoo' }, { note: 1 }, { mood: false },
  ]) assert.equal(diaryInput({ ...valid, ...patch }), null, JSON.stringify(patch));
  for (const input of [null, [], '', 42]) assert.equal(diaryInput(input), null);
});

// A local boundary fake records actual query filters without database/network access.
function fakeAdmin(friendships: { user_id: string; friend_id: string }[] = [], fail = false) {
  const calls: { table: string; method: string; args: unknown[] }[] = [];
  const admin = { from(table: string) {
    const filters: [string, unknown][] = [];
    const query: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'order', 'range', 'update', 'delete']) {
      query[method] = (...args: unknown[]) => {
        calls.push({ table, method, args });
        if (method === 'eq') filters.push([args[0] as string, args[1]]);
        return query;
      };
    }
    query.then = (resolve: (value: unknown) => unknown) => resolve({
      data: friendships.filter(row => filters.every(([key, value]) => row[key as keyof typeof row] === value)),
      error: fail ? { message: 'failed' } : null,
    });
    return query;
  } };
  return { admin: admin as unknown as SupabaseClient, calls };
}

test('diary authorizes owner without querying friendship and rejects one-way/pending/strangers', async () => {
  const own = fakeAdmin();
  assert.equal(await diaryReadAccess(own.admin, owner, owner), true);
  assert.equal(own.calls.length, 0);
  assert.equal(await diaryReadAccess(fakeAdmin().admin, viewer, owner), false);
  assert.equal(await diaryReadAccess(fakeAdmin([{ user_id: viewer, friend_id: owner }]).admin, viewer, owner), false);
  assert.equal(await diaryReadAccess(fakeAdmin([{ user_id: owner, friend_id: viewer }]).admin, viewer, owner), false);
});

test('diary friendship access is fresh and fails closed on database error', async () => {
  const friends = fakeAdmin([{ user_id: viewer, friend_id: owner }, { user_id: owner, friend_id: viewer }]);
  assert.equal(await diaryReadAccess(friends.admin, viewer, owner), true);
  assert.equal(await diaryReadAccess(fakeAdmin().admin, viewer, owner), false);
  await assert.rejects(() => diaryReadAccess(fakeAdmin([], true).admin, viewer, owner));
});

test('diary list and summary queries filter friends visibility before select/count', () => {
  for (const summary of [false, true]) {
    const friend = fakeAdmin();
    diaryEntriesQuery(friend.admin, owner, viewer, summary);
    assert.ok(friend.calls.some(call => call.method === 'eq' && call.args[0] === 'user_id' && call.args[1] === owner));
    assert.ok(friend.calls.some(call => call.method === 'eq' && call.args[0] === 'visibility' && call.args[1] === 'friends'));
    assert.ok(friend.calls.some(call => call.method === 'select' && (call.args[1] as { count: string }).count === 'exact'));
    const own = fakeAdmin();
    diaryEntriesQuery(own.admin, owner, owner, summary);
    assert.equal(own.calls.some(call => call.method === 'eq' && call.args[0] === 'visibility'), false);
  }
});

test('diary mutation scopes updates and deletes to the signed-in owner and entry id', () => {
  for (const action of ['update', 'delete'] as const) {
    const fake = fakeAdmin();
    diaryOwnedQuery(fake.admin, action, owner, viewer, action === 'update' ? { moment: 'changed' } : undefined);
    assert.deepEqual(fake.calls.filter(call => call.method === 'eq').map(call => call.args), [['id', viewer], ['user_id', owner]]);
  }
});

test('diary DTO explicitly maps only supported album and diary fields', () => {
  const row = { id: 'entry', user_id: owner, album_id: 'album', album_title: 'title', artist: 'artist', cover_url: null,
    moment: 'moment', note: 'note', mood: null, listened_on: '2026-11-12', visibility: 'private', created_at: 'now', updated_at: 'now', unexpected: 'secret' };
  assert.deepEqual(diaryEntry(row), { id: 'entry', userId: owner, albumId: 'album', albumTitle: 'title', artist: 'artist', cover: null,
    moment: 'moment', note: 'note', mood: null, listenedOn: '2026-11-12', visibility: 'private', createdAt: 'now', updatedAt: 'now' });
});
