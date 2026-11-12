import test from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { readMeProfileRows } from './meProfileRows';

function mockUser(fields: Record<string, unknown>, missing: string[] = [], error?: { code: string; message: string }) {
  const calls: string[] = [];
  const admin = { from(table: string) {
    assert.equal(table, 'users');
    return { select(columns: string) {
      calls.push(columns);
      return { eq(column: string, value: string) {
        assert.equal(column, 'id');
        assert.equal(value, 'owner');
        return { async maybeSingle() {
          if (error) return { data: null, error };
          if (columns.split(',').some((key) => missing.includes(key.trim()))) {
            return { data: null, error: { code: '42703', message: 'column missing' } };
          }
          return { data: fields.id ? Object.fromEntries(columns.split(',').map((key) => [key.trim(), fields[key.trim()]])) : null, error: null };
        } };
      } };
    } };
  } } as unknown as SupabaseClient;
  return { admin, calls };
}

const fields = {
  id: 'owner', name: 'owner', handle: '@owner', avatar_url: null, created_at: '2026-01-01',
  language: 'fr', region: 'FR', auth_user_id: 'auth', banner_url: 'banner',
  design: 'cream-pop', mode: 'dark', palette: 'lemons', ticker_enabled: false,
  motion_enabled: false, time_format: '12', week_start: 'sun', ratings_visible: false,
  share_live: false, public_reviews: false, discoverable: false,
  is_open_profile: true, region_auto: true, detected_region: 'DE', invite_code: 'invite',
  notify_releases_mine: false, notify_releases_popular: true,
  pinned_albums: ['pinned'], tz_offset: -180,
};

test('all self profile and settings groups share a single users read', async () => {
  const { admin, calls } = mockUser(fields);
  const result = await readMeProfileRows(admin, 'owner');
  assert.equal(calls.length, 1);
  assert.equal(result.user.data?.id, 'owner');
  assert.equal(result.prefs.data?.language, 'fr');
  assert.equal(result.prefs.data?.auth_user_id, 'auth');
  assert.equal(result.prefs.data?.ticker_enabled, false);
  assert.equal(result.isOpenProfile, true);
  assert.deepEqual(result.regionAuto, { regionAuto: true, detectedRegion: 'DE' });
  assert.equal(result.codeRow.data?.invite_code, 'invite');
  assert.equal(result.notifyRow.data?.notify_releases_popular, true);
  assert.equal(result.pinnedRow.data?.tz_offset, -180);
});

test('missing optional column falls back to independent groups without losing account settings', async () => {
  const { admin, calls } = mockUser(fields, ['notify_releases_mine']);
  const result = await readMeProfileRows(admin, 'owner');
  assert.equal(calls.length, 9); // failed combined read, then the independent legacy groups
  assert.equal(result.user.data?.id, 'owner');
  assert.equal(result.prefs.data?.mode, 'dark');
  assert.equal(result.prefs.data?.auth_user_id, 'auth');
  assert.equal(result.notifyRow.data, null);
  assert.deepEqual(result.pinnedRow.data?.pinned_albums, ['pinned']);
  assert.equal(result.isOpenProfile, true);
});

test('missing open-profile and region columns preserve their safe defaults', async () => {
  const { admin } = mockUser(fields, ['is_open_profile', 'region_auto']);
  const result = await readMeProfileRows(admin, 'owner');
  assert.equal(result.user.data?.id, 'owner');
  assert.equal(result.isOpenProfile, false);
  assert.deepEqual(result.regionAuto, { regionAuto: false, detectedRegion: null });
  assert.equal(result.codeRow.data?.invite_code, 'invite');
});

test('a missing account stays null without falling back or inventing a profile', async () => {
  const { admin, calls } = mockUser({});
  const result = await readMeProfileRows(admin, 'owner');
  assert.equal(calls.length, 1);
  assert.equal(result.user.data, null);
  assert.equal(result.isOpenProfile, false);
  assert.deepEqual(result.regionAuto, { regionAuto: false, detectedRegion: null });
});

test('missing timezone still preserves independently loaded profile pins', async () => {
  const { admin } = mockUser(fields, ['tz_offset']);
  const result = await readMeProfileRows(admin, 'owner');
  assert.equal(result.pinnedRow.data, null);
  assert.deepEqual(result.profilePinnedRow.data?.pinned_albums, ['pinned']);
  assert.equal(result.prefs.data?.auth_user_id, 'auth');
});

test('missing preference column does not hide the base profile or other optional groups', async () => {
  const { admin } = mockUser(fields, ['design']);
  const result = await readMeProfileRows(admin, 'owner');
  assert.equal(result.user.data?.id, 'owner');
  assert.equal(result.prefs.data, null);
  assert.equal(result.isOpenProfile, true);
  assert.equal(result.notifyRow.data?.notify_releases_popular, true);
});

test('non-column errors propagate once without a fallback request storm', async () => {
  const error = { code: '42501', message: 'permission denied' };
  const { admin, calls } = mockUser(fields, [], error);
  const result = await readMeProfileRows(admin, 'owner');
  assert.equal(calls.length, 1);
  assert.deepEqual(result.user.error, error);
  assert.equal(result.user.data, null);
});
