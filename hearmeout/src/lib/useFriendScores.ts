'use client';

import { useEffect, useState } from 'react';
import type { Me, PublicProfile, StatsData } from './types';
import { computeMatch } from './matchScore';

export type FriendScore = { pct: number | null; shared: number };

// Taste match % and the number of top artists in common (last 6 months)
// for each friend — the "N shared · 72%" rows on Home and Profile.
export function useFriendScores(me: Me | null, limit = 6): Record<string, FriendScore> {
  const [scores, setScores] = useState<Record<string, FriendScore>>({});
  const ids = (me?.friends ?? []).slice(0, limit).map((f) => f.id).join(',');

  useEffect(() => {
    if (!me || !ids) return;
    let cancelled = false;
    const artistsOf = (d: StatsData | null) => new Set((d?.topArtists || []).map((a) => a.name));
    Promise.all([
      fetch('/api/stats?range=6m').then((r) => (r.ok ? r.json() : null)),
      ...ids.split(',').map(async (id) => {
        const [pr, st] = await Promise.all([fetch(`/api/users/${id}`), fetch(`/api/stats?range=6m&userId=${id}`)]);
        return { id, profile: pr.ok ? (await pr.json() as PublicProfile) : null, stats: st.ok ? (await st.json() as StatsData) : null };
      }),
    ]).then(([mine, ...friends]) => {
      if (cancelled) return;
      const myArtists = artistsOf(mine as StatsData | null);
      setScores(Object.fromEntries((friends as { id: string; profile: PublicProfile | null; stats: StatsData | null }[]).map((f) => [f.id, {
        pct: f.profile ? computeMatch(me.genres, f.profile.genres) : null,
        shared: [...artistsOf(f.stats)].filter((n) => myArtists.has(n)).length,
      }])));
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, me?.genres]);

  return scores;
}
