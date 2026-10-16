import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchSpotifyProfile } from './spotify';

// The region is the United States unless the person picks one, or turns on
// "detect from my streaming account" (users.region_auto, off by default
// since migration 030). Then the connected Spotify account's country is
// asked for once — right away when Spotify is connected, else on the first
// sync after connecting — stored as detected_region and made the region.
// After that Spotify is never asked again: turning the switch off and on
// reuses the stored country. Spotify only returns `country` with the
// user-read-private scope, so accounts connected before that scope was
// added need to reconnect once. Never throws — detection must not break a
// sync, and before migration 023 the columns don't exist.
export const DEFAULT_REGION = 'US';

export async function detectRegionFromSpotify(admin: SupabaseClient, userId: string, accessToken: string): Promise<string | null> {
  try {
    const { data: row, error } = await admin.from('users').select('region_auto, detected_region').eq('id', userId).maybeSingle();
    if (error || !row || row.region_auto !== true) return null;
    if (row.detected_region) return row.detected_region as string;
    const profile = await fetchSpotifyProfile(accessToken);
    const country = typeof profile.country === 'string' && /^[A-Z]{2}$/.test(profile.country) ? profile.country : null;
    if (!country) return null;
    await admin.from('users').update({ detected_region: country, region: country }).eq('id', userId);
    return country;
  } catch {
    return null; // best-effort
  }
}

// Reads the two columns on their own, so /api/me keeps working (as
// "switch off, nothing detected") before migration 023 is applied.
export async function fetchRegionAuto(admin: SupabaseClient, userId: string): Promise<{ regionAuto: boolean; detectedRegion: string | null }> {
  const { data, error } = await admin.from('users').select('region_auto, detected_region').eq('id', userId).maybeSingle();
  if (error || !data) return { regionAuto: false, detectedRegion: null };
  return { regionAuto: data.region_auto === true, detectedRegion: (data.detected_region as string | null) ?? null };
}
