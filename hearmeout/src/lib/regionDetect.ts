import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchSpotifyProfile } from './spotify';

// "Detect from my streaming account" (migration 023): stores the connected
// Spotify account's country and, while the switch is on, makes it the
// account region. Spotify only returns `country` with the user-read-private
// scope, so accounts connected before that scope was added need to
// reconnect once. Never throws — region detection must not break a sync,
// and before migration 023 the columns simply don't exist yet.
export async function detectRegionFromSpotify(admin: SupabaseClient, userId: string, accessToken: string): Promise<void> {
  try {
    const profile = await fetchSpotifyProfile(accessToken);
    const country = typeof profile.country === 'string' && /^[A-Z]{2}$/.test(profile.country) ? profile.country : null;
    if (!country) return;
    const { data: row, error } = await admin.from('users').select('region_auto').eq('id', userId).maybeSingle();
    if (error) return;
    const patch: Record<string, string> = { detected_region: country };
    if (row?.region_auto !== false) patch.region = country;
    await admin.from('users').update(patch).eq('id', userId);
  } catch {
    // ignore: detection is best-effort
  }
}

// Reads the two columns on their own, so /api/me keeps working (as
// "auto on, nothing detected") before migration 023 is applied.
export async function fetchRegionAuto(admin: SupabaseClient, userId: string): Promise<{ regionAuto: boolean; detectedRegion: string | null }> {
  const { data, error } = await admin.from('users').select('region_auto, detected_region').eq('id', userId).maybeSingle();
  if (error || !data) return { regionAuto: true, detectedRegion: null };
  return { regionAuto: data.region_auto !== false, detectedRegion: (data.detected_region as string | null) ?? null };
}
