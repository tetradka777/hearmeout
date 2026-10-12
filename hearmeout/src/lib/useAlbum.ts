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
