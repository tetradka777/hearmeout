'use client';

import { useEffect } from 'react';
import { useApp } from './AppContext';

// An album by the id the app stores it under (catalog slug or Spotify id),
// fetched live when it isn't in the catalog. Null until known.
export function useAlbum(albumId: string | null) {
  const { albums, liveAlbums, ensureLiveAlbum } = useApp();
  useEffect(() => { if (albumId) ensureLiveAlbum(albumId); }, [albumId, ensureLiveAlbum]);
  if (!albumId) return null;
  return liveAlbums[albumId] || albums.find((a) => a.id === albumId) || null;
}

// Several albums at once (for a wall of covers): { id, album } for the ones
// known so far, in order; the rest are fetched and appear as they arrive.
export function useAlbums(albumIds: string[]) {
  const { albums, liveAlbums, ensureLiveAlbum } = useApp();
  const key = albumIds.join(',');
  useEffect(() => {
    for (const id of albumIds) ensureLiveAlbum(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ensureLiveAlbum]);
  return albumIds.flatMap((id) => {
    const album = liveAlbums[id] || albums.find((a) => a.id === id);
    return album ? [{ id, album }] : [];
  });
}
