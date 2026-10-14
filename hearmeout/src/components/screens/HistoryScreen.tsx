'use client';

import { useEffect, useMemo, useState } from 'react';
import { fmt1 } from '@/lib/numberFormat';
import { useApp } from '@/lib/AppContext';
import type { Device, RatingRecord } from '@/lib/types';
import { toLocale, pluralForKey } from '@/lib/i18n';
import { REVIEW_TAG_LABEL_KEY } from '@/lib/reviewTags';
import { MascotIcon } from '../redesign/icons';
import { CoverWall, GenreFill, Phrase } from '../ui/Visual';
import { exportRatingsCsv } from '@/lib/csvExport';

type Filter = 'all' | 'reviewed' | 'private' | 'high' | 'low';
type Sort = 'newest' | 'oldest';

function monthKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`;
}

export function HistoryScreen(_props: { device: Device }) {
  const { state, t, language, me, albums, liveAlbums, spotifyCovers, myRatings, albumRatings, setHistoryQuery, showScreen, openAlbum, goBack, ensureLiveAlbum } = useApp();
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('newest');

  // Ratings for an album outside the static catalog (a live Spotify search
  // result never opened on its own album screen) used to just disappear
  // from History and its CSV export, since HistoryRow silently returns
  // null for an album it can't resolve. Resolving every rated album up
  // front, not just the ones the user happens to click into, is the fix
  // (redesign fix, item 19).
  useEffect(() => {
    for (const r of myRatings) {
      if (!albums.find((a) => a.id === r.albumId) && !liveAlbums[r.albumId]) ensureLiveAlbum(r.albumId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myRatings]);

  const filtered = useMemo(() => {
    const q = (state.historyQuery || '').trim().toLowerCase();
    let list = myRatings;
    if (q) {
      list = list.filter((r) => {
        const a = liveAlbums[r.albumId] || albums.find((x) => x.id === r.albumId);
        return a ? (a.title + ' ' + a.artist + ' ' + r.tags.join(' ')).toLowerCase().includes(q) : false;
      });
    }
    if (filter === 'high') list = list.filter((r) => r.stars >= 4.5);
    else if (filter === 'low') list = list.filter((r) => r.stars < 3);
    else if (filter === 'reviewed') list = list.filter((r) => !!r.review);
    else if (filter === 'private') list = list.filter((r) => r.isPrivate);
    return [...list].sort((a, b) => (sort === 'newest' ? 1 : -1) * (new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
  }, [myRatings, albums, liveAlbums, state.historyQuery, filter, sort]);

  const groups = useMemo(() => {
    const map = new Map<string, RatingRecord[]>();
    for (const r of filtered) {
      const k = monthKey(r.createdAt);
      const arr = map.get(k) || [];
      arr.push(r);
      map.set(k, arr);
    }
    return [...map.entries()];
  }, [filtered]);

  const scoreBuckets = useMemo(() => {
    const buckets = new Array(50).fill(0);
    for (const r of myRatings) buckets[Math.min(50, Math.max(1, Math.round(r.stars * 10))) - 1]++;
    return buckets;
  }, [myRatings]);
  const maxBucket = Math.max(1, ...scoreBuckets);
  const scoreMode = (scoreBuckets.indexOf(Math.max(...scoreBuckets)) + 1) / 10;

  const vsEveryone = useMemo(() => {
    const diffs: number[] = [];
    for (const r of myRatings) {
      const info = albumRatings[r.albumId];
      if (info && info.count > 0) diffs.push(r.stars - info.avg);
    }
    return diffs.length ? diffs.reduce((s, n) => s + n, 0) / diffs.length : 0;
  }, [myRatings, albumRatings]);

  const revisedRatings = useMemo(() => myRatings.filter((r) => r.previousStars != null), [myRatings]);

  const highlights = useMemo(() => {
    if (!myRatings.length) return null;
    const sorted = [...myRatings].sort((a, b) => b.stars - a.stars);
    const highest = sorted[0];
    const lowest = sorted[sorted.length - 1];
    const changedMind = revisedRatings.length
      ? [...revisedRatings].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
      : null;
    return { highest, lowest, changedMind };
  }, [myRatings, revisedRatings]);

  const habits = useMemo(() => {
    const reviewed = myRatings.filter((r) => !!r.review).length;
    const privateCount = myRatings.filter((r) => r.isPrivate).length;
    const tagCounts = new Map<string, number>();
    for (const r of myRatings) for (const tag of r.tags) tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    const topTags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
    return { reviewed, total: myRatings.length, privateCount, topTags };
  }, [myRatings]);

  const albumFor = (albumId: string) => liveAlbums[albumId] || albums.find((x) => x.id === albumId);
  const wallItem = (r: RatingRecord, key: string, sub: string | undefined, badge: string) => {
    const a = albumFor(r.albumId);
    return { key, cover: a ? spotifyCovers[a.id] || a.cover : undefined, title: a?.title ?? r.albumId, artist: a?.artist, artistId: a?.artistId, sub, badge, onClick: () => openAlbum(r.albumId) };
  };

  if (!me) return null;

  const FILTERS: { key: Filter; label: string }[] = [
    { key: 'all', label: t('history.filterAll') },
    { key: 'reviewed', label: t('history.filterReviewed') },
    { key: 'private', label: t('history.filterPrivate') },
    { key: 'high', label: t('history.filterHigh') },
    { key: 'low', label: t('history.filterLow') },
  ];

  const avgScore = myRatings.length ? myRatings.reduce((s, r) => s + r.stars, 0) / myRatings.length : 0;

  return (
    <>
      <button
        className="crumb"
        onClick={() => goBack(state.historyOrigin === 'profile' ? 'profile' : state.historyOrigin === 'rate' ? 'rate' : 'catalog')}
      >
        ‹ {t(state.historyOrigin === 'profile' ? 'history.crumbProfile' : state.historyOrigin === 'rate' ? 'history.crumbRate' : 'history.crumbHome')}
      </button>
      <p className="eyebrow muted">{t('history.eyebrow')}</p>
      <h1 className="big">{t('history.title')}</h1>
      <p style={{ fontWeight: 800, margin: '-6px 0 18px' }}>
        {t('history.summary', { count: myRatings.length, albumWord: pluralForKey(language, myRatings.length, 'history.albumOne', 'history.albumFew', 'history.albumMany'), reviewed: habits.reviewed })}
      </p>

      {/* Numbers as one phrase; the moments as covers (no tables). */}
      {myRatings.length > 0 && (
        <Phrase parts={[
          [fmt1(avgScore), t('profile.averageL')],
          [`${vsEveryone >= 0 ? '+' : '−'}${fmt1(Math.abs(vsEveryone))}`, t('history.vsEveryoneCaption')],
          [revisedRatings.length, pluralForKey(language, revisedRatings.length, 'history.scoreRevisedOne', 'history.scoreRevisedFew', 'history.scoreRevisedMany')],
        ]} />
      )}

      {highlights && (
        <div className="sec">
          <h2>{t('history.highlightsTitle')}</h2>
          <CoverWall items={[
            { key: 'hi', r: highlights.highest, sub: t('history.highestRated'), badge: fmt1(highlights.highest.stars) },
            { key: 'lo', r: highlights.lowest, sub: t('history.lowestRated'), badge: fmt1(highlights.lowest.stars) },
            ...(highlights.changedMind ? [{ key: 'ch', r: highlights.changedMind, sub: t('history.changedMind'), badge: `${fmt1(highlights.changedMind.previousStars!)}→${fmt1(highlights.changedMind.stars)}` }] : []),
          ].map(({ key, r, sub, badge }) => wallItem(r, key, sub, badge))} />
        </div>
      )}

      <div className="bento b3">
        <div className="tile s2">
          <h2>{t('history.scoreDistTitle')}</h2>
          {myRatings.length ? (
            <>
              <div className="h50" role="img" aria-label={t('album.ratingDistribution')}>
                {scoreBuckets.map((n, i) => <i key={i} style={{ height: `${Math.max(3, Math.round((n / maxBucket) * 100))}%` }} />)}
              </div>
              <div className="h50ax" aria-hidden="true"><span>0.1</span><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span></div>
              <p className="muted" style={{ marginTop: 10, fontSize: 14, fontWeight: 600 }}>{t('history.scoreDistModeCaption', { mode: fmt1(scoreMode) })}</p>
            </>
          ) : <p className="muted" style={{ marginTop: 10, fontSize: 14, fontWeight: 600 }}>{t('history.notEnoughForChart')}</p>}
        </div>

        <div className="tile t-soft2">
          <h2>{t('history.favouriteTags')}</h2>
          {habits.topTags.length ? (
            <GenreFill items={habits.topTags.map(([id, count]) => ({ name: t(REVIEW_TAG_LABEL_KEY[id as keyof typeof REVIEW_TAG_LABEL_KEY]), share: count / habits.topTags[0][1] }))} />
          ) : <p className="muted" style={{ fontWeight: 600 }}>{t('history.noTagsYet')}</p>}
        </div>
      </div>

      <div className="sec">
        <h2>{t('history.allRatingsTitle')}</h2>
        <input className="field" type="search" style={{ maxWidth: 420, marginBottom: 12 }} placeholder={t('history.searchPlaceholder')} aria-label={t('history.searchPlaceholder')} value={state.historyQuery || ''} onChange={(e) => setHistoryQuery(e.target.value)} />
        <div className="chips" role="group" aria-label={t('history.filterGroupLabel')}>
          {FILTERS.map((f) => (
            <button key={f.key} className={`chip ${filter === f.key ? 'on' : ''}`} onClick={() => setFilter(f.key)}>{f.label}</button>
          ))}
        </div>
        <div className="chips" role="group" aria-label={t('history.sortGroupLabel')}>
          <button className={`chip ${sort === 'newest' ? 'on' : ''}`} onClick={() => setSort('newest')}>{t('history.sortNewest')}</button>
          <button className={`chip ${sort === 'oldest' ? 'on' : ''}`} onClick={() => setSort('oldest')}>{t('history.sortOldest')}</button>
        </div>

        {filtered.length ? (
          groups.map(([key, rows]) => {
            const avg = rows.reduce((s, r) => s + r.stars, 0) / rows.length;
            // vHistory() heads each group with the full month name; the year
            // is added only for months outside the current year.
            const first = new Date(rows[0].createdAt);
            const label = first.toLocaleDateString(toLocale(language), first.getFullYear() === new Date().getFullYear() ? { month: 'long' } : { month: 'long', year: 'numeric' });
            return (
              <div className="sec" key={key}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10, gap: 10, flexWrap: 'wrap' }}>
                  <h2 style={{ margin: 0 }}>{label}</h2>
                  <span className="muted" style={{ fontWeight: 700 }}>{t('history.monthSummary', { count: rows.length, avg: fmt1(avg) })}</span>
                </div>
                <CoverWall items={rows.map((r) => wallItem(r, r.albumId, r.isPrivate ? t('history.privateBadge') : r.review ? t('history.reviewBadge') : undefined, r.previousStars != null ? `${fmt1(r.previousStars)}→${fmt1(r.stars)}` : fmt1(r.stars)))} />
              </div>
            );
          })
        ) : myRatings.length ? (
          <div className="tile t-soft2 empty">
            <MascotIcon />
            <h3>{t('history.noMatchTitle')}</h3>
            <p className="muted" style={{ fontWeight: 600 }}>{t('history.noMatchHint')}</p>
            <button className="btn" onClick={() => { setFilter('all'); setHistoryQuery(''); }}>{t('history.showAll')}</button>
          </div>
        ) : (
          <div className="tile t-soft2 empty">
            <MascotIcon />
            <h3>{t('history.emptyLine1')}</h3>
            <p className="muted" style={{ fontWeight: 600 }}>{t('history.emptyLine2')}</p>
            <button className="btn" onClick={() => showScreen('discover')}>{t('history.emptyCta')}</button>
          </div>
        )}
        <div className="acts">
          <button className="btn ghost" disabled={!myRatings.length} onClick={() => exportRatingsCsv(myRatings, (id) => liveAlbums[id] || albums.find((x) => x.id === id))}>{t('history.exportBtn')}</button>
        </div>
      </div>
    </>
  );
}
