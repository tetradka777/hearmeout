'use client';

import { useEffect, useState } from 'react';
import type { Me, PublicProfile } from './types';
import { computeMatch } from './matchScore';
import { cachedJson } from './cachedJson';

export type FriendScore = { pct: number | null };

// The cards only show genre overlap; requesting six months of listening
// statistics for every friend adds no information to that percentage.
// Publish independently so one slow profile cannot hold up the other cards.
export function subscribeFriendScores(
  genres: PublicProfile['genres'],
  ids: string[],
  onScore: (id: string, score: FriendScore) => void,
): () => void {
  let cancelled = false;
  for (const id of ids) {
    void cachedJson<PublicProfile>(`/api/users/${id}`).then(profile => {
      if (!cancelled) onScore(id, { pct: profile ? computeMatch(genres, profile.genres) : null });
    });
  }
  return () => { cancelled = true; };
}

export function useFriendScores(me: Me | null, limit = 6): Record<string, FriendScore> {
  const [result, setResult] = useState<{ scope: string; scores: Record<string, FriendScore> } | null>(null);
  const userId = me?.id;
  const genres = me?.genres;
  const ids = (me?.friends ?? []).slice(0, limit).map((f) => f.id).join(',');
  // Hide the previous account/selection immediately, before effect cleanup.
  const scope = JSON.stringify([userId, ids, genres]);

  useEffect(() => {
    if (!userId || !genres || !ids) return;
    return subscribeFriendScores(genres, ids.split(','), (id, score) => {
      setResult(previous => ({ scope, scores: { ...(previous?.scope === scope ? previous.scores : {}), [id]: score } }));
    });
  }, [userId, ids, genres, scope]);

  return result?.scope === scope ? result.scores : {};
}
