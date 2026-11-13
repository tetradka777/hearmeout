'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useApp } from '@/lib/AppContext';
import { uniqueDiscovery } from '@/lib/homeDiscovery';
import { buildDiscoveryBlocks } from '@/lib/homeDiscoveryLayout';
import type { Recommendation } from '@/app/api/recommendations/route';
import { cachedPage, useCachedJson } from '@/lib/cachedJson';
import { usePaged } from '@/lib/usePaged';
import { useAlbums } from '@/lib/useAlbum';
import type { ChartAlbumLite } from '@/lib/appleCharts';
import { AlbumShelfCard, ReviewCard, Shelf } from './ui/SuperCards';
import { FanClubReleases } from './FanClubReleases';
import { ComingSoon } from './ComingSoon';

type Review = { stars: number; review: string; tags?: string[]; createdAt: string; albumId: string; user: { id: string; name: string; handle: string; avatarUrl: string | null } };

// Optional sources start only near the visible Home, then stay mounted.
function DeferredHomeSection({ children, surface = 'catalog' }: { children: ReactNode; surface?: 'catalog' | 'discover' }) {
  const { state } = useApp();
  const anchor = useRef<HTMLDivElement>(null);
  const [started, setStarted] = useState(false);
  useEffect(() => {
    if (started || state.activeScreen !== surface || !anchor.current) return;
    const observer = new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting)) setStarted(true); }, { rootMargin: '400px' });
    observer.observe(anchor.current);
    return () => observer.disconnect();
  }, [started, state.activeScreen, surface]);
  return <div className="home29defer" ref={anchor}>{started && children}</div>;
}

export function HomeContinuation({ surface = 'catalog' }: { surface?: 'catalog' | 'discover' }) {
  return <DeferredHomeSection surface={surface}><ContinuationFeed surface={surface} /></DeferredHomeSection>;
}

function ContinuationFeed({ surface }: { surface: 'catalog' | 'discover' }) {
  const { t, me, state, openAlbum, showToast, albums, liveAlbums, feed } = useApp();
  const [visible, setVisible] = useState(16);
  const [loadingMore, setLoadingMore] = useState(false);
  const lock = useRef(false);
  const pendingSources = useRef(0);
  const [sourceVersion, setSourceVersion] = useState(0);
  async function readSource<T>(url: string): Promise<T> {
    pendingSources.current++;
    try { return await cachedPage<T>(url); } finally { pendingSources.current--; setSourceVersion(v => v + 1); }
  }
  const sentinel = useRef<HTMLDivElement>(null);
  const autoDepth = useRef<number | null>(null);
  const reviews = usePaged<Review, number>(async from => {
    const page = await readSource<{ reviews: Review[]; next: number | null }>(`/api/reviews/recent?from=${from ?? 0}`);
    return { items: page.reviews, next: page.next };
  }, r => `${r.user.id}|${r.albumId}`, [], 0);
  const charts = usePaged<ChartAlbumLite, number>(async page => {
    const data = await readSource<{ albums: ChartAlbumLite[]; next: number | null }>(`/api/charts/more?mode=discovery&page=${page ?? 0}&region=${encodeURIComponent(me?.region ?? 'US')}`);
    return { items: data.albums, next: data.next };
  }, a => `${a.title}|${a.artist}`.toLowerCase(), [me?.region], 0);
  const picks = useCachedJson<Recommendation[]>('/api/recommendations').data;
  // Reuse the exact cached head-chart request; don't repeat its visible albums.
  const headCharts = useCachedJson<ChartAlbumLite[]>(surface === 'discover' ? `/api/charts/albums${me?.region ? '?region=' + encodeURIComponent(me.region) : ''}` : null).data;
  const known = useMemo(() => {
    const index = new Map(albums.map(a => [a.id, a]));
    for (const a of albums) if (a.spotifyId) index.set(a.spotifyId, a);
    for (const [id, a] of Object.entries(liveAlbums)) { index.set(id, a); if (a.spotifyId) index.set(a.spotifyId, a); }
    return index;
  }, [albums, liveAlbums]);
  const selection = useMemo(() => {
    const ids = [...(feed?.trending ?? []).map(a => a.albumId), ...(picks ?? []).map(a => a.albumId), ...(feed?.events ?? []).flatMap(e => e.albumId ? [e.albumId] : [])];
    return uniqueDiscovery(reviews.items, charts.items, id => known.get(id), ids, [...ids.flatMap(id => known.has(id) ? [known.get(id)!] : []), ...(headCharts ?? [])]);
  }, [reviews.items, charts.items, feed, picks, known, headCharts]);
  const reviewLimit = Math.ceil(visible / 16) * 5;
  const requestedReviews = selection.reviews.slice(0, reviewLimit);
  useAlbums(requestedReviews.map(r => r.albumId));
  const shownReviews = requestedReviews.filter(r => known.has(r.albumId));
  const displayedAlbums = selection.albums.slice(0, visible);
  const blocks = buildDiscoveryBlocks(displayedAlbums, shownReviews.length);
  const exhausted = charts.done && reviews.done && visible >= selection.albums.length && reviewLimit >= selection.reviews.length;
  const failed = charts.failed || reviews.failed;
  const { done: chartsDone, more: moreCharts } = charts, { done: reviewsDone, more: moreReviews } = reviews;
  const albumCount = selection.albums.length, reviewCount = selection.reviews.length;
  const rawCount = charts.items.length + reviews.items.length;
  const loadMore = useCallback(async () => {
    if (lock.current || pendingSources.current > 0 || state.activeScreen !== surface) return;
    lock.current = true; setLoadingMore(true);
    const next = visible + 16;
    setVisible(next);
    try {
      await Promise.all([
        albumCount <= next && !chartsDone ? moreCharts() : undefined,
        reviewCount <= Math.ceil(next / 16) * 5 && !reviewsDone ? moreReviews() : undefined,
      ]);
    } finally { lock.current = false; setLoadingMore(false); }
  }, [visible, albumCount, reviewCount, chartsDone, reviewsDone, moreCharts, moreReviews, state.activeScreen, surface]);
  useEffect(() => {
    if (exhausted || failed || loadingMore || pendingSources.current > 0 || !rawCount || state.activeScreen !== surface || !sentinel.current) return;
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(e => e.isIntersecting) || !sentinel.current) return;
      const depth = sentinel.current.getBoundingClientRect().top + window.scrollY;
      // Appending to one horizontal shelf must not eagerly fetch every page.
      if (autoDepth.current != null && depth <= autoDepth.current + 8) return;
      autoDepth.current = depth; void loadMore();
    }, { rootMargin: '180px' });
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [exhausted, failed, loadingMore, rawCount, state.activeScreen, loadMore, surface, sourceVersion]);
  const open = async (album: ChartAlbumLite) => {
    const res = await fetch(`/api/spotify/resolve-album?title=${encodeURIComponent(album.title)}&artist=${encodeURIComponent(album.artist)}`).catch(() => null);
    if (!res?.ok) { showToast(t('toast.albumOpenFailed')); return; }
    openAlbum((await res.json()).id);
  };
  const albumCard = (index: number) => {
    const a = displayedAlbums[index];
    return <AlbumShelfCard key={`${a.title}|${a.artist}`} title={a.title} artist={a.artist} cover={a.cover} onClick={() => void open(a)} />;
  };
  const reviewCard = (index: number) => known.has(shownReviews[index].albumId) ? <ReviewCard key={`${shownReviews[index].user.id}|${shownReviews[index].albumId}`} {...shownReviews[index]} /> : null;
  const hasContent = displayedAlbums.length > 0 || shownReviews.some(r => known.has(r.albumId));
  const row = (title: string | undefined, children: ReactNode, reviews = false) => title
    ? <Shelf loop={!reviews} title={title} className={reviews ? 'home29reviews' : ''}>{children}</Shelf>
    : <Shelf loop={!reviews} className={reviews ? 'home29reviews' : 'home32row'}>{children}</Shelf>;
  if (exhausted && !hasContent) return null;
  return <section className="home28 home29 sec">
    {hasContent && <h2>{t('home.trendingNow')}</h2>}
    {blocks.map((block, i) => block.kind === 'reviews' && !block.indices.some(index => known.has(shownReviews[index].albumId)) ? null : <div className={`home29block${i > 0 ? ' divided39' : ''}`} key={block.key}>
      {block.kind === 'albums' ? row(undefined, block.indices.map(albumCard)) :
        block.indices.length === 1 ? <div className="home29review">{reviewCard(block.indices[0])}</div> :
        row(undefined, block.indices.map(reviewCard), true)}
      {surface === 'catalog' && i === 0 && <DeferredHomeSection><FanClubReleases /></DeferredHomeSection>}
      {surface === 'catalog' && i === 3 && <DeferredHomeSection><ComingSoon /></DeferredHomeSection>}
    </div>)}
    <div ref={sentinel} className="home28more">{exhausted ? <p className="muted">{t('home.exploreEnd')}</p> : <button className="btn ghost" disabled={loadingMore} aria-busy={loadingMore} onClick={() => void loadMore()}>{t(failed ? 'home.exploreRetry' : loadingMore ? 'app.loading' : 'home.exploreMore')}</button>}</div>
  </section>;
}
