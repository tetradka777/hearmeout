import type { GroupDetail } from './types';

// The group page's answer kept for a minute per viewer and period: it reads
// three months of everyone's plays, and the background preload plus opening
// the page used to compute it twice in a row. Votes, members, mute and
// leaving drop the group's entries at once (single server process).
const TTL_MS = 60 * 1000;
const cache = new Map<string, { at: number; detail: GroupDetail }>();

const key = (groupId: string, userId: string, period: string) => `${groupId}|${userId}|${period}`;

export function cachedGroupDetail(groupId: string, userId: string, period: string): GroupDetail | null {
  const hit = cache.get(key(groupId, userId, period));
  return hit && Date.now() - hit.at < TTL_MS ? hit.detail : null;
}

export function storeGroupDetail(groupId: string, userId: string, period: string, detail: GroupDetail): void {
  if (cache.size > 500) cache.clear();
  cache.set(key(groupId, userId, period), { at: Date.now(), detail });
}

export function invalidateGroupDetail(groupId: string): void {
  for (const k of [...cache.keys()]) if (k.startsWith(groupId + '|')) cache.delete(k);
}
