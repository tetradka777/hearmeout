'use client';

import { cachedJson } from './cachedJson';
import type { GroupSummary, Me } from './types';

// The pages you open from a list — each friend's profile, taste-match line
// and stats, each group — fetched in the background after the main screens,
// one person or group at a time so a free-tier server isn't flooded. They
// land in the shared cache (lib/cachedJson), so opening one shows it at once.
export async function preloadDetails(me: Me, stillWanted: () => boolean): Promise<void> {
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
}
