import test from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getUserProfile } from './userProfile';

const owner = { id: 'owner', name: 'owner', handle: '@owner', avatar_url: null, created_at: '2026-01-01' };
const friends = [{ id: 'friend', name: 'friend', handle: '@friend', avatarUrl: null }];
const playedAt = new Date().toISOString();
const ratings = [
  { album_id: 'private', stars: 5, review: 'secret', tags: [], created_at: '2026-01-01', is_private: true },
  { album_id: 'public', stars: 4, review: 'review', tags: [], created_at: '2026-01-01', is_private: false },
];

function client(open = false, friend = false, share = true) {
  const calls: { table: string; columns: string }[] = [];
  const admin = { from(table: string) {
    let columns = '';
    let single = false;
    const query = {
      select(value: string) { columns = value; return query; },
      eq() { return query; }, not() { return query; }, gte() { return query; }, in() { return query; },
      order() { return query; }, limit() { return query; }, range() { return query; },
      maybeSingle() { single = true; return query; },
      then(resolve: (value: unknown) => void) {
        calls.push({ table, columns });
        let data: unknown = [];
        if (table === 'users') {
          data = columns === 'is_open_profile' ? { is_open_profile: open }
            : columns === 'pinned_albums' ? { pinned_albums: ['pinned'] }
            : columns.includes('ratings_visible') ? [{ id: owner.id, ratings_visible: share, share_live: share, public_reviews: true }]
            : owner;
        } else if (table === 'ratings') data = ratings;
        else if (table === 'listening_events') {
          data = columns === 'genre' ? [{ genre: 'pop' }]
            : columns === 'duration_ms' ? [{ duration_ms: 60000 }]
            : single ? { track_title: 'song', artist: 'artist', played_at: playedAt, duration_ms: 60000, cover_url: null, album_id: 'album' } : [];
        } else if (table === 'friendships') {
          data = columns === 'user_id' ? (friend ? { user_id: 'owner' } : null)
            : columns === 'created_at' ? { created_at: '2026-01-01' }
            : columns === 'friend_id' ? []
            : [{ friend: { ...friends[0], avatar_url: null } }];
        }
        resolve({ data, error: null });
      },
    };
    return query;
  } } as unknown as SupabaseClient;
  return { admin, calls };
}

function selfRows() {
  return {
    user: Promise.resolve({ data: owner, error: null }),
    isOpenProfile: Promise.resolve(false),
    pinnedAlbums: Promise.resolve(['pinned']),
    friends: Promise.resolve(friends),
  };
}

test('self profile reuses request rows with identical output and zero users/friends queries', async () => {
  const baseline = client();
  const expected = await getUserProfile(baseline.admin, 'owner', 'owner');
  const shared = client();
  const actual = await getUserProfile(shared.admin, 'owner', 'owner', selfRows());
  assert.deepEqual(actual, expected);
  assert.equal(baseline.calls.filter((c) => c.table === 'users').length, 3);
  assert.equal(baseline.calls.filter((c) => c.table === 'friendships').length, 1);
  assert.equal(shared.calls.filter((c) => c.table === 'users' || c.table === 'friendships').length, 0);
  assert.equal(actual?.recentRatings?.[0].review, 'secret');
});

test('self seeds cannot open a stranger closed profile', async () => {
  const { admin } = client();
  const profile = await getUserProfile(admin, 'owner', 'stranger', selfRows());
  assert.equal(profile?.locked, true);
  assert.deepEqual(profile?.genres, []);
  assert.equal(profile?.recentRatings, undefined);
  assert.equal(profile?.friends, undefined);
});

test('open public teaser omits the friend graph, recent ratings, and current playback', async () => {
  const { admin } = client(true);
  const profile = await getUserProfile(admin, 'owner', 'stranger');
  assert.equal(profile?.locked, undefined);
  assert.equal(profile?.friends, undefined);
  assert.equal(profile?.recentRatings, undefined);
  assert.equal(profile?.nowPlaying, null);
  assert.deepEqual(profile?.top4Albums, ['pinned']);
});

test('accepted friend sees public ratings but privacy switches hide ratings and playback', async () => {
  const { admin } = client(false, true, false);
  const profile = await getUserProfile(admin, 'owner', 'viewer');
  assert.deepEqual(profile?.recentRatings, []);
  assert.equal(profile?.stats.avg, 0);
  assert.equal(profile?.nowPlaying, null);
  assert.equal(profile?.lastPlayed, null);
});

test('accepted friend never receives a private rating or its review', async () => {
  const { admin } = client(false, true);
  const profile = await getUserProfile(admin, 'owner', 'viewer');
  assert.deepEqual(profile?.recentRatings?.map((r) => r.albumId), ['public']);
  assert.equal(profile?.recentRatings?.[0].review, 'review');
});

test('shared missing user and read errors preserve self-profile failures', async () => {
  const { admin } = client();
  assert.equal(await getUserProfile(admin, 'owner', 'owner', {
    ...selfRows(), user: Promise.resolve({ data: null, error: null }),
  }), null);
  const error = { message: 'users unavailable' };
  await assert.rejects(getUserProfile(admin, 'owner', 'owner', {
    ...selfRows(), user: Promise.resolve({ data: null, error }),
  }), (caught) => caught === error);
});
