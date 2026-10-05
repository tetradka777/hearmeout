import type { PublicProfile } from './types';

// Taste-match percentage: overlap of two people's genre-share profiles —
// sum of min(share) over sum of max(share), across the union of both
// people's genres. Symmetric: match(A, B) === match(B, A). (It used to walk
// only the first person's genres, so the same pair could show different
// numbers depending on whose screen you were on.) Shared by Match, Home,
// the friend profile and group taste pairs.
export function computeMatch(mine: PublicProfile['genres'], theirs: PublicProfile['genres']): number | null {
  // No listening data on either side: "not enough to compare", not 0%.
  if (!mine.length || !theirs.length) return null;
  const genres = new Set([...mine.map((g) => g.g), ...theirs.map((g) => g.g)]);
  let overlap = 0;
  let total = 0;
  for (const g of genres) {
    const a = mine.find((x) => x.g === g)?.pct ?? 0;
    const b = theirs.find((x) => x.g === g)?.pct ?? 0;
    overlap += Math.min(a, b);
    total += Math.max(a, b);
  }
  return total > 0 ? Math.round((overlap / total) * 100) : null;
}
