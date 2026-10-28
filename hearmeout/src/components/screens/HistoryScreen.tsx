'use client';

import { useEffect, useMemo, useState } from 'react';
import { fmt1 } from '@/lib/numberFormat';
import { useApp } from '@/lib/AppContext';
import type { Device, RatingRecord } from '@/lib/types';
import { toLocale, pluralForKey } from '@/lib/i18n';
import { REVIEW_TAG_LABEL_KEY } from '@/lib/reviewTags';
import { MascotIcon } from '../redesign/icons';
import { CoverWall, GenreFill } from '../ui/Visual';
import { blurStyle } from '@/lib/imageColor';
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
  const scoreMode = (scoreBuckets.indexOf(Math.max(...scoreBuckets)) + 1) / 10;
  // The chart in half-star steps: up to 0.5, up to 1.0 … up to 5.0.
  const halfBuckets = useMemo(() => {
    const b = new Array(10).fill(0);
    for (const r of myRatings) b[Math.min(9, Math.max(0, Math.ceil(r.stars * 2) - 1))]++;
    return b;
  }, [myRatings]);
  const maxHalf = Math.max(1, ...halfBuckets);

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
  const latest = [...myRatings].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  const latestAlbum = latest ? albumFor(latest.albumId) : undefined;
  const heroCover = latestAlbum ? spotifyCovers[latestAlbum.id] || latestAlbum.cover : undefined;

  return (
    <>
      <button
        className="crumb"
        onClick={() => goBack(state.historyOrigin === 'profile' ? 'profile' : state.historyOrigin === 'rate' ? 'rate' : 'catalog')}
      >
        ‹ {t(state.historyOrigin === 'profile' ? 'history.crumbProfile' : state.historyOrigin === 'rate' ? 'history.crumbRate' : 'history.crumbHome')}
      </button>
      <h1 className="big">{t('history.title')}</h1>

      {/* The whole history at a glance, over the latest rated cover. */}
      {myRatings.length > 0 && (
        <div className="tile bh15 hh23" style={blurStyle(heroCover, 300)}>
          <p className="hhn"><b>{myRatings.length}</b> {pluralForKey(language, myRatings.length, 'history.albumOne', 'history.albumFew', 'history.albumMany')}</p>
          <div className="st15">
            <div><b>{fmt1(avgScore)}</b><small>{t('profile.averageL')}</small></div>
            <div><b>{`${vsEveryone >= 0 ? '+' : '−'}${fmt1(Math.abs(vsEveryone))}`}</b><small>{t('history.vsEveryoneCaption')}</small></div>
            <div><b>{habits.reviewed}</b><small>{t('history.reviewedL')}</small></div>
          </div>
        </div>
      )}

      {/* The moments: each card over its own blurred cover. */}
      {highlights && (
        <div className="sec">
          <h2>{t('history.highlightsTitle')}</h2>
          {/* The moments as cover cards, like every other shelf. */}
          <CoverWall row items={[
            wallItem(highlights.highest, 'hi', t('history.highestRated'), fmt1(highlights.highest.stars)),
            wallItem(highlights.lowest, 'lo', t('history.lowestRated'), fmt1(highlights.lowest.stars)),
            ...(highlights.changedMind ? [wallItem(highlights.changedMind, 'ch', t('history.changedMind'), `${fmt1(highlights.changedMind.previousStars!)}→${fmt1(highlights.changedMind.stars)}`)] : []),
          ]} />
        </div>
      )}

      <div className="sec two">
        <div className="tile nt23">
          <h2>{t('history.scoreDistTitle')}</h2>
          {myRatings.length ? (
            <>
              {/* Half-star steps, the count over each bar. */}
              <div className="hd23" role="img" aria-label={t('album.ratingDistribution')}>
                {halfBuckets.map((n, i) => (
                  <div key={i} className={n === maxHalf ? 'on' : ''}>
                    <small>{n || ''}</small>
                    <i style={{ height: `${Math.max(4, Math.round((n / maxHalf) * 100))}%` }} />
                    <span>{fmt1((i + 1) / 2)}</span>
                  </div>
                ))}
              </div>
              <p className="muted" style={{ marginTop: 12, fontSize: 14, fontWeight: 600 }}>{t('history.scoreDistCaption', { mode: fmt1(scoreMode) })}</p>
            </>
          ) : <p className="muted" style={{ marginTop: 10, fontSize: 14, fontWeight: 600 }}>{t('history.notEnoughForChart')}</p>}
        </div>

        <div className="tile nt23">
          <h2>{t('history.favouriteTags')}</h2>
          {habits.topTags.length ? (
            <GenreFill items={habits.topTags.map(([id, count]) => ({ name: t(REVIEW_TAG_LABEL_KEY[id as keyof typeof REVIEW_TAG_LABEL_KEY]), share: count / habits.topTags[0][1] }))} />
          ) : <p className="muted" style={{ fontWeight: 600 }}>{t('history.noTagsYet')}</p>}
        </div>
      </div>

      <div className="sec">
        <h2>{t('history.allRatingsTitle')}</h2>
        <input className="field" type="search" style={{ marginBottom: 12 }} placeholder={t('history.searchPlaceholder')} aria-label={t('history.searchPlaceholder')} value={state.historyQuery || ''} onChange={(e) => setHistoryQuery(e.target.value)} />
        {/* Filters and the order in one swipeable row. */}
        <div className="chips hc23">
          <span role="group" aria-label={t('history.filterGroupLabel')}>
            {FILTERS.map((f) => (
              <button key={f.key} className={`chip ${filter === f.key ? 'on' : ''}`} onClick={() => setFilter(f.key)}>{f.label}</button>
            ))}
          </span>
          <span role="group" aria-label={t('history.sortGroupLabel')}>
            <button className={`chip ${sort === 'newest' ? 'on' : ''}`} onClick={() => setSort('newest')}>{t('history.sortNewest')}</button>
            <button className={`chip ${sort === 'oldest' ? 'on' : ''}`} onClick={() => setSort('oldest')}>{t('history.sortOldest')}</button>
          </span>
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
                <div className="hm23">
                  <h2 style={{ margin: 0 }}>{label}</h2>
                  <span>{t('history.monthSummary', { count: rows.length, avg: fmt1(avg) })}</span>
                </div>
                <CoverWall items={rows.map((r) => wallItem(r, r.albumId, r.isPrivate ? t('history.privateBadge') : r.review ? t('history.reviewBadge') : undefined, r.previousStars != null ? `${fmt1(r.previousStars)}→${fmt1(r.stars)}` : fmt1(r.stars)))} />
              </div>
            );
          })
        ) : myRatings.length ? (
          <div className="tile nt23 empty">
            <MascotIcon />
            <h3>{t('history.noMatchTitle')}</h3>
            <p className="muted" style={{ fontWeight: 600 }}>{t('history.noMatchHint')}</p>
            <button className="btn" onClick={() => { setFilter('all'); setHistoryQuery(''); }}>{t('history.showAll')}</button>
          </div>
        ) : (
          <div className="tile nt23 empty">
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
