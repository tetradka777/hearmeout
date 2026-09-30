import type { PublicProfile } from './types';

// Taste-match percentage: overlap of two people's genre-share profiles
// (min/max per genre, summed). Shared by Match and the Home feed's "taste
// match" rows.
export function computeMatch(mine: PublicProfile['genres'], theirs: PublicProfile['genres']): number | null {
  const overlap = mine.map((mg) => ({ me: mg.pct, friend: theirs.find((x) => x.g === mg.g)?.pct ?? 0 }));
  const denom = overlap.reduce((s, o) => s + Math.max(o.me, o.friend), 0);
  return denom > 0 ? Math.round((overlap.reduce((s, o) => s + Math.min(o.me, o.friend), 0) / denom) * 100) : null;
}
