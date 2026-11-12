import type { SupabaseClient } from '@supabase/supabase-js';
import type { SelfProfileRows } from './userProfile';

type MeUserRow = NonNullable<Awaited<SelfProfileRows['user']>['data']> & {
  language?: string | null; region?: string | null; auth_user_id?: string | null;
  banner_url?: string | null; design?: string | null; mode?: string | null; palette?: string | null;
  ticker_enabled?: boolean | null; motion_enabled?: boolean | null;
  time_format?: string | null; week_start?: string | null;
  ratings_visible?: boolean | null; share_live?: boolean | null;
  public_reviews?: boolean | null; discoverable?: boolean | null;
  is_open_profile?: boolean | null; region_auto?: boolean | null; detected_region?: string | null;
  invite_code?: string | null; notify_releases_mine?: boolean | null; notify_releases_popular?: boolean | null;
  pinned_albums?: string[] | null; tz_offset?: number | null;
};

const PROFILE_COLUMNS = 'id, name, handle, avatar_url, created_at';
const PREF_COLUMNS = 'language, region, auth_user_id, banner_url, design, mode, palette, ticker_enabled, motion_enabled, time_format, week_start, ratings_visible, share_live, public_reviews, discoverable';
const OPEN_COLUMNS = 'is_open_profile';
const REGION_COLUMNS = 'region_auto, detected_region';
const CODE_COLUMNS = 'invite_code';
const NOTIFY_COLUMNS = 'notify_releases_mine, notify_releases_popular';
const PINNED_COLUMNS = 'pinned_albums, tz_offset';

// Request-scoped rows for /api/me and its self-profile builder. Optional
// migration groups retain their independent fallback and safe defaults.
export async function readMeProfileRows(admin: SupabaseClient, userId: string) {
  const read = async (columns: string) => {
    const result = await admin.from('users').select(columns).eq('id', userId).maybeSingle();
    // Dynamic column lists cannot be inferred by the untyped server client.
    return { data: result.data as unknown as MeUserRow | null, error: result.error };
  };
  const combined = await read([PROFILE_COLUMNS, PREF_COLUMNS, OPEN_COLUMNS, REGION_COLUMNS, CODE_COLUMNS, NOTIFY_COLUMNS, PINNED_COLUMNS].join(', '));
  // A missing optional column makes a combined select fail atomically.
  // Fall back to the original groups instead of losing unrelated prefs.
  // Other errors keep the original error rather than causing a read storm.
  const missingColumn = combined.error?.code === '42703' || combined.error?.code === 'PGRST204';
  const [user, prefs, openRow, regionRow, codeRow, notifyRow, pinnedRow, profilePinnedRow] = missingColumn
    ? await Promise.all([
      read(PROFILE_COLUMNS), read(PREF_COLUMNS), read(OPEN_COLUMNS), read(REGION_COLUMNS),
      read(CODE_COLUMNS), read(NOTIFY_COLUMNS), read(PINNED_COLUMNS), read('pinned_albums'),
    ])
    : [combined, combined, combined, combined, combined, combined, combined, combined];
  return {
    user, prefs, codeRow, notifyRow, pinnedRow, profilePinnedRow,
    isOpenProfile: !openRow.error && !!openRow.data?.is_open_profile,
    regionAuto: regionRow.error || !regionRow.data
      ? { regionAuto: false, detectedRegion: null }
      : { regionAuto: regionRow.data.region_auto === true, detectedRegion: (regionRow.data.detected_region as string | null) ?? null },
  };
}
