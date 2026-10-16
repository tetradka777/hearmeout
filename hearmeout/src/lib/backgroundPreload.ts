'use client';

import { cachedJson, peekJson } from './cachedJson';
import { prefetchAlbum } from './prefetchPages';
import type { FeedResponse, GroupSummary, Me } from './types';

const ALBUMS_MAX = 16;

// The pages you open from a list — each friend's profile, taste-match line
// and stats, each group, then the albums you're most likely to open (the
// home feed's, what's trending among friends, your own latest ratings) —
// fetched in the background after the main screens, one at a time so a
// free-tier server isn't flooded. They land in the shared cache
// (lib/cachedJson), so opening one shows it at once. None of it asks
// Spotify for anything.
export async function preloadDetails(me: Me, stillWanted: () => boolean): Promise<void> {
  // Your own stats for the other periods (the screen opens on this week),
  // under the same keys the stats screen uses (period, weekStart, offset).
  const statsKey = (period: string, offset?: number) => {
    const p = new URLSearchParams({ period, weekStart: me.weekStart });
    if (offset != null) p.set('offset', String(offset));
    return `/api/stats?${p.toString()}`;
  };
  for (const url of [statsKey('week', -1), statsKey('month', 0), statsKey('month', -1), statsKey('season')]) {
    if (!stillWanted()) return;
    await cachedJson(url);
  }
  for (const f of me.friends) {
    if (!stillWanted()) return;
    await Promise.all([
      cachedJson(`/api/users/${f.id}`),
      cachedJson(`/api/stats?range=6m&userId=${f.id}`),
      cachedJson(`/api/stats?period=week&userId=${f.id}`),
      cachedJson(`/api/match/${f.id}/history`),
    ]);
  }
  const groups = await cachedJson<GroupSummary[]>('/api/groups');
  for (const g of groups || []) {
    if (!stillWanted()) return;
    await cachedJson(`/api/groups/${g.id}?period=month`);
  }

  const feed = peekJson<FeedResponse>(`/api/feed?tz=${new Date().getTimezoneOffset()}`);
  const ids: string[] = [];
  const add = (id: string | null | undefined) => { if (id && !ids.includes(id)) ids.push(id); };
  add(feed?.hero?.albumId);
  for (const e of feed?.events || []) add(e.albumId);
  for (const tr of feed?.trending || []) add(tr.albumId);
  for (const r of me.recentRatings || []) add(r.albumId);
  for (const id of me.top4Albums || []) add(id);
  for (const id of ids.slice(0, ALBUMS_MAX)) {
    if (!stillWanted()) return;
    await prefetchAlbum(id, me.friends.length > 0);
  }
}
