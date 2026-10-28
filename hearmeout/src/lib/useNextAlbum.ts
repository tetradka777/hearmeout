'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useApp } from './AppContext';
import { useCachedJson } from './cachedJson';
import type { QueueTrack } from './PlayerContext';
import type { Album } from './types';
import type { Recommendation } from '@/app/api/recommendations/route';

// What plays after the last track of the queue (a swipe or "next" on the
// bar): an album your friends loved that you haven't rated, else one from
// the catalogue in the genres you rate highest — never the album that just
// played, one you rated, or one this bar already went through.
export function useNextAlbum(current: QueueTrack | null, atEnd: boolean): () => QueueTrack[] | null {
  const { albums, liveAlbums, myRatings, spotifyCovers, ensureLiveAlbum } = useApp();
  const recs = useCachedJson<Recommendation[]>(current ? '/api/recommendations' : null).data;
  const used = useRef(new Set<string>());

  // Near the end, the first picks' tracklists are fetched, so they're ready.
  useEffect(() => {
    if (atEnd) for (const r of (recs || []).slice(0, 4)) ensureLiveAlbum(r.albumId);
  }, [atEnd, recs, ensureLiveAlbum]);

  return useCallback(() => {
    const albumOf = (id: string): Album | undefined => liveAlbums[id] || albums.find((a) => a.id === id || a.spotifyId === id);
    const rated = new Set(myRatings.map((r) => r.albumId));
    const cur = current?.albumId ?? null;
    const curSpotify = current?.spotifyId ?? null;
    const ok = (a: Album | undefined): a is Album => !!a && a.tracklist.length > 0
      && !rated.has(a.id) && !(a.spotifyId && rated.has(a.spotifyId))
      && a.id !== cur && a.id !== curSpotify && !(a.spotifyId && (a.spotifyId === cur || a.spotifyId === curSpotify))
      && !used.current.has(a.id);

    let pick: Album | undefined = (recs || []).map((r) => albumOf(r.albumId)).find(ok);
    if (!pick) {
      // Your taste: genres weighted by how you rate them.
      const weight = new Map<string, number>();
      for (const r of myRatings) {
        const g = albumOf(r.albumId)?.genreBucket;
        if (g) weight.set(g, (weight.get(g) ?? 0) + (r.stars - 2.5));
      }
      const ranked = albums.filter(ok).sort((x, y) => (weight.get(y.genreBucket) ?? 0) - (weight.get(x.genreBucket) ?? 0));
      // A little variety among the closest ones.
      pick = ranked[Math.floor(Math.random() * Math.min(5, ranked.length))];
    }
    if (!pick) return null;
    used.current.add(pick.id);
    const cover = spotifyCovers[pick.id] || pick.cover || null;
    return pick.tracklist.map((title) => ({ title, artist: pick.artist, cover, albumId: pick.id, spotifyId: pick.spotifyId ?? null }));
  }, [albums, liveAlbums, myRatings, spotifyCovers, recs, current]);
}
