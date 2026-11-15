type RepeatedTrack = { trackId?: string | null; title: string; artist: string; plays: number };

export function qualifyingRepeats<T extends RepeatedTrack>(tracks: readonly T[] | null | undefined): T[] {
  const repeated = (tracks ?? []).filter(track => track.plays >= 2);
  const distinct = new Set(repeated.map(track => track.trackId || `${track.title.trim().toLowerCase()}|${track.artist.trim().toLowerCase()}`));
  return distinct.size >= 4 ? repeated : [];
}
