import type { SupabaseClient } from '@supabase/supabase-js';

// The Settings → Privacy switches (users.ratings_visible / share_live /
// public_reviews / discoverable). Missing columns or nulls mean "on" — the
// same default /api/me reports.
export type PrivacyFlags = { ratingsVisible: boolean; shareLive: boolean; publicReviews: boolean };

export async function fetchPrivacy(admin: SupabaseClient, userIds: string[]): Promise<Map<string, PrivacyFlags>> {
  const map = new Map<string, PrivacyFlags>();
  const ids = [...new Set(userIds)].filter(Boolean);
  if (!ids.length) return map;
  const { data } = await admin.from('users').select('id, ratings_visible, share_live, public_reviews').in('id', ids);
  for (const u of data || []) {
    map.set(u.id as string, {
      ratingsVisible: u.ratings_visible !== false,
      shareLive: u.share_live !== false,
      publicReviews: u.public_reviews !== false,
    });
  }
  return map;
}

export const DEFAULT_PRIVACY: PrivacyFlags = { ratingsVisible: true, shareLive: true, publicReviews: true };
