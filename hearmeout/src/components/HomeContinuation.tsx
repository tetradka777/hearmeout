'use client';

import { useEffect, useRef, useState } from 'react';
import { useApp } from '@/lib/AppContext';
import { uniqueDiscovery } from '@/lib/homeDiscovery';
import type { Recommendation } from '@/app/api/recommendations/route';
import { cachedPage, useCachedJson } from '@/lib/cachedJson';
import { usePaged } from '@/lib/usePaged';
import { useAlbums } from '@/lib/useAlbum';
import type { ChartAlbumLite } from '@/lib/appleCharts';
import { AlbumShelfCard, ReviewCard } from './ui/SuperCards';

type Review = { stars: number; review: string; tags?: string[]; createdAt: string; albumId: string; user: { id: string; name: string; handle: string; avatarUrl: string | null } };

// Start only when this part of Home comes near the viewport. All data comes
// from existing public-review/privacy and cached chart endpoints.
export function HomeContinuation() {
  const { state } = useApp();
  const anchor = useRef<HTMLDivElement>(null);
  const [started, setStarted] = useState(false);
  useEffect(() => {
    if (started || state.activeScreen !== 'catalog' || !anchor.current) return;
    const observer = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) setStarted(true); }, { rootMargin: '600px' });
    observer.observe(anchor.current);
    return () => observer.disconnect();
  }, [started, state.activeScreen]);
  return <div ref={anchor}>{started && <ContinuationFeed />}</div>;
}

function ContinuationFeed() {
  const { t, me, state, openAlbum, showToast, albums, liveAlbums, feed } = useApp();
  const [visible, setVisible] = useState(8);
  const sentinel = useRef<HTMLDivElement>(null);
  const reviews = usePaged<Review, number>(async (from) => {
    const page = await cachedPage<{ reviews: Review[]; next: number | null }>(`/api/reviews/recent?from=${from ?? 0}`);
    return { items: page.reviews, next: page.next };
  }, (r) => `${r.user.id}|${r.albumId}`, [], 0);
  const charts = usePaged<ChartAlbumLite, number>(async (page) => {
    const data = await cachedPage<{ albums: ChartAlbumLite[]; next: number | null }>(`/api/charts/more?page=${page ?? 0}&region=${encodeURIComponent(me?.region ?? 'US')}`);
    return { items: data.albums, next: data.next };
  }, (a) => `${a.title}|${a.artist}`.toLowerCase(), [me?.region], 0);
  const picks = useCachedJson<Recommendation[]>('/api/recommendations').data ?? [];
  // Do not repeat reviews already in the friends' activity above.
  const known = (id: string) => liveAlbums[id] || albums.find((a) => a.id === id || a.spotifyId === id);
  const upperIds = [...(feed?.trending ?? []).map((a) => a.albumId), ...picks.map((a) => a.albumId), ...(feed?.events ?? []).flatMap((e) => e.albumId ? [e.albumId] : [])];
  const selection = uniqueDiscovery(reviews.items, charts.items, known, upperIds, upperIds.flatMap((id) => known(id) ? [known(id)!] : []));
  const shownReviews = selection.reviews.slice(0, Math.ceil(visible / 4));
  useAlbums(shownReviews.map((r) => r.albumId));
  const displayedAlbums = selection.albums.slice(0, visible);
  const exhausted = charts.done && reviews.done && visible >= selection.albums.length && Math.ceil(visible / 4) >= selection.reviews.length;
  const failed = charts.failed || reviews.failed;
  const loadMore = () => {
    setVisible((n) => n + 8);
    if (selection.albums.length <= visible + 8 && !charts.done) void charts.more();
    if (selection.reviews.length <= Math.ceil((visible + 8) / 4) && !reviews.done) void reviews.more();
  };
  const { done: chartsDone, more: moreCharts } = charts;
  const { done: reviewsDone, more: moreReviews } = reviews;
  const chartCount = charts.items.length, reviewCount = reviews.items.length;
  const albumCount = selection.albums.length, selectedReviewCount = selection.reviews.length;
  useEffect(() => {
    if (exhausted || failed || (!chartCount && !reviewCount) || state.activeScreen !== 'catalog' || !sentinel.current) return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      setVisible((n) => n + 8);
      if (albumCount <= visible + 8 && !chartsDone) void moreCharts();
      if (selectedReviewCount <= Math.ceil((visible + 8) / 4) && !reviewsDone) void moreReviews();
    }, { rootMargin: '200px' });
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [visible, chartCount, reviewCount, albumCount, selectedReviewCount, chartsDone, reviewsDone, moreCharts, moreReviews, exhausted, failed, state.activeScreen]);
  const open = async (album: ChartAlbumLite) => {
    const response = await fetch(`/api/spotify/resolve-album?title=${encodeURIComponent(album.title)}&artist=${encodeURIComponent(album.artist)}`).catch(() => null);
    if (!response?.ok) { showToast(t('toast.albumOpenFailed')); return; }
    openAlbum((await response.json()).id);
  };
  const count = Math.max(Math.ceil(displayedAlbums.length / 4), shownReviews.length);
  return <section className="home28 sec">
    <h2>{t('home.keepExploring')}</h2>
    {Array.from({ length: count }, (_, i) => <div className="home28batch" key={i}>
      {displayedAlbums.slice(i * 4, i * 4 + 4).length > 0 && <div className="home28albums">{displayedAlbums.slice(i * 4, i * 4 + 4).map((a) => <AlbumShelfCard key={`${a.title}|${a.artist}`} title={a.title} artist={a.artist} cover={a.cover} onClick={() => void open(a)} />)}</div>}
      {shownReviews[i] && known(shownReviews[i].albumId) && <ReviewCard {...shownReviews[i]} />}
    </div>)}
    {!count && !failed && <p className="muted">{t('app.loading')}</p>}
    <div ref={sentinel} className="home28more">{exhausted ? <p className="muted">{t('home.exploreEnd')}</p> : <button className="btn ghost" onClick={loadMore}>{t(failed ? 'home.exploreRetry' : 'home.exploreMore')}</button>}</div>
  </section>;
}
