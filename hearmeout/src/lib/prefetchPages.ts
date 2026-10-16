'use client';

import { cachedJson, peekJson, storeJson } from './cachedJson';
import { albumFriendsUrl, albumReviewsUrl, albumStatsUrl } from './useAlbumJson';

// Pages fetched before they're opened, so opening one shows it at once.
// Everything here is cheap for the server and costs no Spotify quota:
// artist pages are taken only from the server's cache (?cached=1), album
// pages are our own database. Each page is prefetched at most once per visit.
const done = new Set<string>();

// An artist page, when the pointer goes over (or a finger down on) a link to
// it. Only an artist the server has seen before; a new one loads on open.
export function prefetchArtist(id: string | null | undefined): void {
  if (!id || done.has(`a:${id}`)) return;
  done.add(`a:${id}`);
  const pageKey = `/api/spotify/artist/${id}`;
  const topKey = `/api/artist/${id}/top-tracks`;
  if (!peekJson(pageKey)) {
    fetch(`${pageKey}?cached=1`).then((r) => (r.status === 200 ? r.json() : null)).then((d) => { if (d && !peekJson(pageKey)) storeJson(pageKey, d); }).catch(() => {});
  }
  if (!peekJson(topKey)) {
    fetch(`${topKey}?cached=1`).then((r) => (r.status === 200 ? r.json() : null)).then((d) => { if (d && !peekJson(topKey)) storeJson(topKey, d); }).catch(() => {});
  }
}

// An album page's own blocks (community stats, reviews, friends' scores).
export function prefetchAlbum(albumId: string | null | undefined, withFriends: boolean): Promise<unknown> {
  if (!albumId || done.has(`al:${albumId}`)) return Promise.resolve();
  done.add(`al:${albumId}`);
  return Promise.all([
    cachedJson(albumStatsUrl(albumId)),
    cachedJson(albumReviewsUrl(albumId)),
    withFriends ? cachedJson(albumFriendsUrl(albumId)) : null,
  ]);
}
