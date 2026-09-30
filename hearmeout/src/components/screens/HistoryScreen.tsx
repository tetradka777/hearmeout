'use client';

import { useMemo, useState } from 'react';
import { useApp } from '@/lib/AppContext';
import type { Device, RatingRecord } from '@/lib/types';
import { CoverArt } from '../ui/CoverArt';
import { starsText } from '@/lib/format';
import { toLocale } from '@/lib/i18n';
import { SearchIcon } from '../ui/Icons';
import { PremiumLock } from '../ui/PremiumLock';
import { accentMix } from '@/lib/accentGradient';

type Filter = 'all' | 'high' | 'low' | 'reviewed';
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
    <div className="history-row" onClick={() => openRateFor(a.id, 'history')}>
      <div className="hr-date">{date.toLocaleDateString(toLocale(language), { day: '2-digit', month: 'short' })}</div>
      <CoverArt url={cover} fallbackLetter={a.artist[0] || '?'} className="art-sm" />
      <div className="hr-info">
        <div className="hr-title">{a.title}</div>
        <div className="hr-artist">{a.artist}</div>
      </div>
      {rating.review && <span className="history-badge">{t('history.reviewBadge')}</span>}
      <div className="history-score">
        <span className="stars-dot" style={{ color: accentMix(rating.stars / 5) }}>{starsText(rating.stars)}</span>
        <span className="num">{rating.stars.toFixed(1)}</span>
      </div>
    </div>
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

export function HistoryScreen({ device }: { device: Device }) {
  const { state, t, language, me, albums, liveAlbums, myRatings, setHistoryQuery, showScreen } = useApp();
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
    if (filter === 'high') list = list.filter((r) => r.stars >= 4.5);
    else if (filter === 'low') list = list.filter((r) => r.stars < 3);
    else if (filter === 'reviewed') list = list.filter((r) => !!r.review);
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

  // 50 buckets, one per exact tenth-star value (0.1–5.0) — matches the
  // per-album distribution on the album page, instead of collapsing to
  // whole stars.
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

  if (!me) return null;

  const FILTERS: { key: Filter; label: string }[] = [
    { key: 'all', label: t('history.filterAll') },
    { key: 'high', label: t('history.filterHigh') },
    { key: 'low', label: t('history.filterLow') },
    { key: 'reviewed', label: t('history.filterReviewed') },
  ];

  const rail = (
    <>
      <div className="history-side-card">
        <h3>{t('history.scoreDistTitle')}</h3>
        {myRatings.length ? (
          <>
            <p className="history-chart-caption">{t('history.scoreDistCaption')}</p>
            <div className="rating-dist-chart" style={{ height: 60 }}>
              {scoreBuckets.map((n, i) => (
                <div key={i} className="rating-dist-bar" style={{ height: `${n ? Math.max(6, (n / maxBucket) * 100) : 0}%`, background: accentMix((i + 1) / 50) }} title={`${((i + 1) / 10).toFixed(1)} ★ · ${n}`} />
              ))}
            </div>
            <div className="rating-dist-axis"><span>0</span><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span></div>
          </>
        ) : <div className="empty-state">{t('history.notEnoughForChart')}</div>}
      </div>
      <div className="history-side-card">
        <h3>{t('history.monthlySparkTitle')}</h3>
        {monthlyAvg.length >= 2 ? (
          <>
            <p className="history-chart-caption">{t('history.monthlySparkCaption')}</p>
            <div className="history-sparkline">
              {monthlyAvg.map((m, i) => (
                <div key={i} className="bar" style={{ height: `${Math.max(4, (m.avg / maxMonthlyAvg) * 100)}%`, background: accentMix(m.avg / 5) }} title={`${m.label}: ${m.avg.toFixed(1)} (${m.count})`} />
              ))}
            </div>
            <div className="history-sparkline-labels">{monthlyAvg.map((m, i) => <span key={i}>{m.label}</span>)}</div>
          </>
        ) : monthlyAvg.length === 1 ? (
          <p className="history-chart-caption">{t('history.monthlySparkSingle', { label: monthlyAvg[0].label, avg: monthlyAvg[0].avg.toFixed(1), count: monthlyAvg[0].count })}</p>
        ) : <div className="empty-state">{t('history.notEnoughForChart')}</div>}
      </div>
      <div className="history-side-card">
        <h3>{t('history.exportTitle')}</h3>
        <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5, marginBottom: 12 }}>{t('history.exportDesc')}</p>
        <button className="btn-ghost" style={{ width: '100%', marginBottom: 10 }} disabled={!myRatings.length} onClick={() => exportCsv(myRatings, albums, liveAlbums)}>
          {t('history.exportBtn')}
        </button>
        <PremiumLock label={t('history.exportJsonLocked')}>
          <button className="btn-ghost" style={{ width: '100%', marginBottom: 0 }} disabled={!myRatings.length} onClick={() => exportJson(myRatings, albums, liveAlbums)}>
            {t('history.exportJsonBtn')}
          </button>
        </PremiumLock>
      </div>
    </>
  );

  const list = (
    <>
      <div className="history-toolbar">
        <div className="chips" style={{ marginBottom: 0 }}>
          {FILTERS.map((f) => (
            <button key={f.key} className={`chip ${filter === f.key ? 'on' : ''}`} onClick={() => setFilter(f.key)}>{f.label}</button>
          ))}
        </div>
        <button className="history-sort" onClick={() => setSort((s) => (s === 'newest' ? 'oldest' : 'newest'))}>
          {sort === 'newest' ? t('history.sortNewest') : t('history.sortOldest')} ▾
        </button>
      </div>
      {filtered.length ? (
        groups.map(([key, rows]) => {
          const avg = rows.reduce((s, r) => s + r.stars, 0) / rows.length;
          const label = new Date(rows[0].createdAt).toLocaleDateString(toLocale(language), { month: 'long', year: 'numeric' });
          return (
            <div key={key}>
              <div className="history-month">
                <span>{label} · {rows.length}</span>
                <span>{t('history.monthAvg')} {avg.toFixed(1)}</span>
              </div>
              {rows.map((r) => <HistoryRow key={r.albumId} rating={r} />)}
            </div>
          );
        })
      ) : state.historyQuery ? (
        <div className="empty-state">
          {t('history.noResults')}
          <div style={{ marginTop: 10 }}><button className="btn-ghost" onClick={() => setHistoryQuery('')}>{t('history.clearSearch')}</button></div>
        </div>
      ) : (
        <div className="empty-state">
          {t('history.emptyLine1')}<br />{t('history.emptyLine2')}
          <div style={{ marginTop: 10 }}><button className="btn-primary" style={{ margin: '0 auto' }} onClick={() => showScreen('catalog')}>{t('history.emptyCta')}</button></div>
        </div>
      )}
    </>
  );

  return (
    <>
      <div className="eyebrow">{t('history.eyebrow')}</div>
      <h1 className="page-title">{t('history.title')}</h1>
      <div className="history-summary">{t('history.summary', { count: me.stats.ratings, reviewed: me.stats.reviews })}</div>
      <div className="search-bar">
        <SearchIcon />
        <input type="text" placeholder={t('history.searchPlaceholder')} value={state.historyQuery || ''} onChange={(e) => setHistoryQuery(e.target.value)} />
      </div>
      {device === 'desktop' ? (
        <div className="history-layout">
          <div className="history-main">{list}</div>
          <div className="history-rail">{rail}</div>
        </div>
      ) : (
        <>
          {list}
          {rail}
        </>
      )}
    </>
  );
}
