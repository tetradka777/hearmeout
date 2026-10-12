import type { StatsData } from './types';

// Artists two people both listen to (the "N shared artists" lines): every
// artist each played at least twice in the window (StatsData.artistNames),
// not just their top ten, which almost never overlapped. Answers cached
// before that field existed fall back to the top ten. In the first person's
// order (most played first), names compared without case.
export function sharedArtists(a: StatsData | null, b: StatsData | null): string[] {
  if (!a || !b) return [];
  const listA = a.artistNames ?? a.topArtists.map((x) => x.name);
  const listB = b.artistNames ?? b.topArtists.map((x) => x.name);
  const inB = new Set(listB.map((n) => n.toLowerCase()));
  return listA.filter((n) => inB.has(n.toLowerCase()));
}
