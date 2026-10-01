'use client';

import { useMemo, useState } from 'react';
import { useApp } from '@/lib/AppContext';
import type { Device, RatingRecord } from '@/lib/types';
import { CoverArt } from '../ui/CoverArt';
import { Stars } from '../redesign/Stars';
import { toLocale } from '@/lib/i18n';
import { SearchIcon } from '../ui/Icons';
import { REVIEW_TAG_ORDER, REVIEW_TAG_LABEL_KEY } from '@/lib/reviewTags';

type Filter = 'all' | 'reviewed' | 'private' | 'high' | 'low';
type Sort = 'newest' | 'oldest';

function monthKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}`;
}

function HistoryRow({ rating }: { rating: RatingRecord }) {
  const { albums, liveAlbums, spotifyCovers, language, openRateFor, t } = useApp();
  const a = liveAlbums[rating.albumId] || albums.find((x) => x.id === rating.albumId);
  if (!a) return null;
  const cover = spotifyCovers[a.id] || a.cover;
  const date = new Date(rating.createdAt);
  return (
    <button className="row" onClick={() => openRateFor(a.id, 'history')} style={{ cursor: 'pointer', width: '100%' }}>
      <small className="muted" style={{ width: 48 }}>{date.toLocaleDateString(toLocale(language), { day: '2-digit', month: 'short' })}</small>
      <CoverArt url={cover} fallbackLetter={a.artist[0] || '?'} className="cov" style={{ width: 40, height: 40 }} />
      <div className="g"><b>{a.title}</b><div className="muted">{a.artist}</div></div>
      {rating.isPrivate && <span className="tag">{t('history.privateBadge')}</span>}
      {rating.review && <span className="tag">{t('history.reviewBadge')}</span>}
      {rating.previousStars != null && <span className="tag">{rating.previousStars.toFixed(1)} → {rating.stars.toFixed(1)}</span>}
      <Stars value={rating.stars} size={14} />
    </button>
  );
}

function exportCsv(ratings: RatingRecord[], albums: ReturnType<typeof useApp>['albums'], liveAlbums: ReturnType<typeof useApp>['liveAlbums']) {
  const rows = [['date', 'title', 'artist', 'score', 'review']];
  for (const r of ratings) {
    const a = liveAlbums[r.albumId] || albums.find((x) => x.id === r.albumId);
    if (!a) continue;
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
    rows.push([r.createdAt, esc(a.title), esc(a.artist), r.stars.toFixed(1), esc(r.review || '')]);
  }
  const csv = rows.map((row) => row.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'hearmeout-ratings.csv';
  link.click();
  URL.revokeObjectURL(url);
}

function exportJson(ratings: RatingRecord[], albums: ReturnType<typeof useApp>['albums'], liveAlbums: ReturnType<typeof useApp>['liveAlbums']) {
  const rows = ratings
    .map((r) => {
      const a = liveAlbums[r.albumId] || albums.find((x) => x.id === r.albumId);
      if (!a) return null;
      return { date: r.createdAt, title: a.title, artist: a.artist, score: r.stars, review: r.review || null };
    })
    .filter((r) => r !== null);
  const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'hearmeout-ratings.json';
  link.click();
  URL.revokeObjectURL(url);
}

export function HistoryScreen(_props: { device: Device }) {
  const { state, t, language, me, albums, liveAlbums, myRatings, albumRatings, setHistoryQuery, showScreen, openRateFor } = useApp();
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('newest');

  const filtered = useMemo(() => {
    const q = (state.historyQuery || '').trim().toLowerCase();
    let list = myRatings;
    if (q) {
      list = list.filter((r) => {
        const a = albums.find((x) => x.id === r.albumId);
        return a ? a.title.toLowerCase().includes(q) || a.artist.toLowerCase().includes(q) : false;
      });
    }
    if (filter === 'high') list = list.filter((r) => r.stars >= 4);
    else if (filter === 'low') list = list.filter((r) => r.stars <= 2.5);
    else if (filter === 'reviewed') list = list.filter((r) => !!r.review);
    else if (filter === 'private') list = list.filter((r) => r.isPrivate);
    return [...list].sort((a, b) => (sort === 'newest' ? 1 : -1) * (new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
  }, [myRatings, albums, state.historyQuery, filter, sort]);

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

  const monthlyAvg = useMemo(() => {
    const map = new Map<string, { sum: number; count: number; label: string }>();
    for (const r of myRatings) {
      const d = new Date(r.createdAt);
      const k = monthKey(r.createdAt);
      const cur = map.get(k) || { sum: 0, count: 0, label: d.toLocaleDateString(toLocale(language), { month: 'short', year: '2-digit' }) };
      cur.sum += r.stars;
      cur.count += 1;
      map.set(k, cur);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-6).map(([, v]) => ({ avg: v.sum / v.count, count: v.count, label: v.label }));
  }, [myRatings, language]);
  const maxMonthlyAvg = Math.max(1, ...monthlyAvg.map((m) => m.avg));

  const vsEveryone = useMemo(() => {
    const diffs: number[] = [];
    for (const r of myRatings) {
      const info = albumRatings[r.albumId];
      if (info && info.count > 0) diffs.push(r.stars - info.avg);
    }
    return diffs.length ? diffs.reduce((s, n) => s + n, 0) / diffs.length : null;
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

  const albumTitle = (albumId: string) => {
    const a = liveAlbums[albumId] || albums.find((x) => x.id === albumId);
    return a ? `${a.title} — ${a.artist}` : albumId;
  };

  if (!me) return null;

  const FILTERS: { key: Filter; label: string }[] = [
    { key: 'all', label: t('history.filterAll') },
    { key: 'reviewed', label: t('history.filterReviewed') },
    { key: 'private', label: t('history.filterPrivate') },
    { key: 'high', label: t('history.filterHigh') },
    { key: 'low', label: t('history.filterLow') },
  ];

  return (
    <>
      <div className="eyebrow">{t('history.eyebrow')}</div>
      <h1 className="big">{t('history.title')}</h1>
      <p className="muted">{t('history.summary', { count: me.stats.ratings, reviewed: me.stats.reviews })}</p>
      <div className="field" style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '14px 0' }}>
        <SearchIcon />
        <input style={{ flex: 1, background: 'transparent', border: 0 }} placeholder={t('history.searchPlaceholder')} value={state.historyQuery || ''} onChange={(e) => setHistoryQuery(e.target.value)} />
      </div>

      <div className="bento b3">
        <div className="tile">
          <h3>{t('history.scoreDistTitle')}</h3>
          {myRatings.length ? (
            <>
              <p className="muted">{t('history.scoreDistCaption')}</p>
              <div className="h50" style={{ marginTop: 10 }}>
                {scoreBuckets.map((n, i) => <i key={i} style={{ height: n ? `${Math.max(6, (n / maxBucket) * 100)}%` : '2%' }} title={`${((i + 1) / 10).toFixed(1)} ★ · ${n}`} />)}
              </div>
              <div className="h50ax"><span>0.1</span><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span></div>
            </>
          ) : <p className="muted">{t('history.notEnoughForChart')}</p>}
        </div>

        <div className="tile">
          <h3>{t('history.monthlySparkTitle')}</h3>
          {monthlyAvg.length >= 2 ? (
            <>
              <p className="muted">{t('history.monthlySparkCaption')}</p>
              <div className="bars" style={{ marginTop: 10 }}>
                {monthlyAvg.map((m, i) => <i key={i} style={{ height: `${Math.max(4, (m.avg / maxMonthlyAvg) * 100)}%` }} title={`${m.label}: ${m.avg.toFixed(1)} (${m.count})`} />)}
              </div>
              <div className="axis">{monthlyAvg.map((m, i) => <span key={i}>{m.label}</span>)}</div>
            </>
          ) : monthlyAvg.length === 1 ? (
            <p className="muted">{t('history.monthlySparkSingle', { label: monthlyAvg[0].label, avg: monthlyAvg[0].avg.toFixed(1), count: monthlyAvg[0].count })}</p>
          ) : <p className="muted">{t('history.notEnoughForChart')}</p>}
        </div>

        <div className="tile">
          <h3>{t('history.exportTitle')}</h3>
          <p className="muted">{t('history.exportDesc')}</p>
          <div className="acts">
            <button className="btn ghost" disabled={!myRatings.length} onClick={() => exportCsv(myRatings, albums, liveAlbums)}>{t('history.exportBtn')}</button>
            <button className="btn ghost" disabled={!myRatings.length} onClick={() => exportJson(myRatings, albums, liveAlbums)}>{t('history.exportJsonBtn')}</button>
          </div>
        </div>

        <div className="tile">
          <div className="stack">
            <div>
              <h3>{t('history.vsEveryoneTitle')}</h3>
              {vsEveryone != null ? (
                <p className="muted">{vsEveryone >= 0 ? '+' : ''}{vsEveryone.toFixed(1)} {t('history.vsEveryoneDesc')}</p>
              ) : <p className="muted">{t('history.notEnoughForChart')}</p>}
            </div>
            <div>
              <h3>{t('history.revisedTitle')}</h3>
              <p className="muted">{t('history.revisedCount', { count: revisedRatings.length })}</p>
            </div>
          </div>
        </div>

        <div className="tile">
          <h3>{t('history.highlightsTitle')}</h3>
          {highlights ? (
            <div className="stack" style={{ marginTop: 10 }}>
              <button className="row" style={{ width: '100%', cursor: 'pointer' }} onClick={() => openRateFor(highlights.highest.albumId, 'history')}>
                <small className="muted">{t('history.highestRated')}</small>
                <div className="g"><b>{albumTitle(highlights.highest.albumId)}</b></div>
                <Stars value={highlights.highest.stars} size={14} />
              </button>
              <button className="row" style={{ width: '100%', cursor: 'pointer' }} onClick={() => openRateFor(highlights.lowest.albumId, 'history')}>
                <small className="muted">{t('history.lowestRated')}</small>
                <div className="g"><b>{albumTitle(highlights.lowest.albumId)}</b></div>
                <Stars value={highlights.lowest.stars} size={14} />
              </button>
              {highlights.changedMind && (
                <button className="row" style={{ width: '100%', cursor: 'pointer' }} onClick={() => openRateFor(highlights.changedMind!.albumId, 'history')}>
                  <small className="muted">{t('history.changedMind')}</small>
                  <div className="g"><b>{albumTitle(highlights.changedMind.albumId)}</b></div>
                  <span className="tag">{highlights.changedMind.previousStars!.toFixed(1)} → {highlights.changedMind.stars.toFixed(1)}</span>
                </button>
              )}
            </div>
          ) : <p className="muted">{t('history.notEnoughForChart')}</p>}
        </div>

        <div className="tile">
          <h3>{t('history.habitsTitle')}</h3>
          <div className="stack" style={{ marginTop: 10 }}>
            <div>
              <div className="setrow" style={{ border: 0, padding: 0 }}>
                <small className="muted">{t('history.reviewsWritten')}</small>
                <small className="muted">{habits.reviewed} / {habits.total}</small>
              </div>
              <div className="meter"><i style={{ width: `${habits.total ? (habits.reviewed / habits.total) * 100 : 0}%` }} /></div>
            </div>
            <p className="muted">{t('history.keptPrivate', { count: habits.privateCount })}</p>
            {habits.topTags.length > 0 && (
              <div className="chips" style={{ marginBottom: 0 }}>
                {habits.topTags.map(([id, count]) => (
                  <span key={id} className="chip">{t(REVIEW_TAG_LABEL_KEY[id as keyof typeof REVIEW_TAG_LABEL_KEY])} · {count}</span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="tile s3">
          <div className="setrow" style={{ border: 0, padding: 0 }}>
            <div className="chips" style={{ marginBottom: 0 }}>
              {FILTERS.map((f) => (
                <button key={f.key} className={`chip ${filter === f.key ? 'on' : ''}`} onClick={() => setFilter(f.key)}>{f.label}</button>
              ))}
            </div>
            <button className="chip" onClick={() => setSort((s) => (s === 'newest' ? 'oldest' : 'newest'))}>
              {sort === 'newest' ? t('history.sortNewest') : t('history.sortOldest')} ▾
            </button>
          </div>
          {filtered.length ? (
            <div className="stack" style={{ marginTop: 14 }}>
              {groups.map(([key, rows]) => {
                const avg = rows.reduce((s, r) => s + r.stars, 0) / rows.length;
                const label = new Date(rows[0].createdAt).toLocaleDateString(toLocale(language), { month: 'long', year: 'numeric' });
                return (
                  <div key={key}>
                    <div className="setrow" style={{ border: 0, padding: '8px 0' }}>
                      <b>{label} · {rows.length}</b>
                      <small className="muted">{t('history.monthAvg')} {avg.toFixed(1)}</small>
                    </div>
                    <div className="stack">{rows.map((r) => <HistoryRow key={r.albumId} rating={r} />)}</div>
                  </div>
                );
              })}
            </div>
          ) : state.historyQuery ? (
            <div className="tile empty" style={{ marginTop: 14 }}>
              <p>{t('history.noResults')}</p>
              <button className="btn ghost" onClick={() => setHistoryQuery('')}>{t('history.clearSearch')}</button>
            </div>
          ) : (
            <div className="tile empty" style={{ marginTop: 14 }}>
              <p>{t('history.emptyLine1')}<br />{t('history.emptyLine2')}</p>
              <button className="btn" onClick={() => showScreen('catalog')}>{t('history.emptyCta')}</button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
