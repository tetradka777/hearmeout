import type { SupabaseClient } from '@supabase/supabase-js';

// A person's friend ids, kept in this process for a minute: the feed asked
// the database for them before anything else on every load. Cleared for
// both people whenever a friendship is made or removed.
const TTL_MS = 60 * 1000;
const memo = new Map<string, { at: number; ids: Promise<string[]> }>();

export function friendIdsOf(admin: SupabaseClient, userId: string): Promise<string[]> {
  const hit = memo.get(userId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.ids;
  const ids = Promise.resolve(admin.from('friendships').select('friend_id').eq('user_id', userId))
    .then(({ data, error }) => {
      if (error) memo.delete(userId);
      return (data || []).map((r) => r.friend_id as string);
    });
  memo.set(userId, { at: Date.now(), ids });
  if (memo.size > 5000) memo.delete(memo.keys().next().value!);
  return ids;
}

// After a friendship changes (no ids: everyone, e.g. a deleted account).
export function forgetFriendIds(...userIds: string[]): void {
  if (!userIds.length) { memo.clear(); return; }
  for (const id of userIds) memo.delete(id);
}
