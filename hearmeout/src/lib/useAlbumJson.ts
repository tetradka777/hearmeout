'use client';

import { useEffect, useRef } from 'react';
import { useCachedJson } from './cachedJson';

// An album page's data (stats, reviews, friends' ratings, your plays)
// through the browser's shared cache (lib/cachedJson): a page seen before
// opens with its data at once and refreshes quietly, the same URL used by
// two blocks is one request, and a background preload can fill it before
// the page is opened. refreshToken: bumped after the user rates, which
// forces a fresh answer.
export function useAlbumJson<T>(url: string | null, refreshToken = 0): T | null {
  return useAlbumJsonState<T>(url, refreshToken).data;
}

// The same with whether the last load failed (so a block can stop saying
// "loading…" when the request didn't work).
export function useAlbumJsonState<T>(url: string | null, refreshToken = 0): { data: T | null; failed: boolean } {
  const { data, failed, reload } = useCachedJson<T>(url);
  const first = useRef(refreshToken);
  useEffect(() => {
    if (refreshToken === first.current) return;
    first.current = refreshToken;
    void reload();
  }, [refreshToken, reload]);
  return { data, failed };
}

export const albumStatsUrl = (albumId: string) => `/api/albums/${encodeURIComponent(albumId)}/stats`;
export const albumReviewsUrl = (albumId: string) => `/api/albums/${encodeURIComponent(albumId)}/reviews`;
export const albumFriendsUrl = (albumId: string) => `/api/albums/${encodeURIComponent(albumId)}/friends`;
