'use client';

import { useMemo, useState } from 'react';
import { useApp } from '@/lib/AppContext';
import type { Device, RatingRecord } from '@/lib/types';
import { CoverArt } from '../ui/CoverArt';
import { Stars } from '../redesign/Stars';
import { toLocale, pluralForKey } from '@/lib/i18n';
import { REVIEW_TAG_LABEL_KEY } from '@/lib/reviewTags';
import { MascotIcon } from '../redesign/icons';

type Filter = 'all' | 'reviewed' | 'private' | 'high' | 'low';
type Sort = 'newest' | 'oldest';

function monthKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`;
}

// vHistory()'s row: cover, title/artist·date(+private inline), a "with
// review" tag, a prev→now .rev pill, stars, AND a large numeric score —
// not just stars.
function HistoryRow({ rating }: { rating: RatingRecord }) {
  const { albums, liveAlbums, spotifyCovers, language, openAlbum, t } = useApp();
  const a = liveAlbums[rating.albumId] || albums.find((x) => x.id === rating.albumId);
  if (!a) return null;
  const cover = spotifyCovers[a.id] || a.cover;
  const date = new Date(rating.createdAt).toLocaleDateString(toLocale(language), { day: '2-digit', month: 'short' });
  return (
    <button className="row" onClick={() => openAlbum(a.id)} style={{ cursor: 'pointer', width: '100%' }}>
      <CoverArt url={cover} fallbackLetter={a.artist[0] || '?'} className="cov" style={{ width: 48, height: 48 }} />
      <div className="g">
        <b>{a.title}</b>
        <small className="muted" style={{ fontWeight: 600 }}>{a.artist} · {date}{rating.isPrivate ? ` · ${t('history.privateBadge')}` : ''}</small>
      </div>
      {rating.review && <span className="tag">{t('history.reviewBadge')}</span>}
      {rating.previousStars != null && <span className="rev">{rating.previousStars.toFixed(1)} → {rating.stars.toFixed(1)}</span>}
      <Stars value={rating.stars} size={14} />
      <span className="num" style={{ fontSize: 26, width: 44, textAlign: 'right' }}>{rating.stars.toFixed(1)}</span>
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

// vHistory()'s sparkHtml(): a real SVG line chart (not bars) over the last
// 6 months that actually have a rating, with hoverable/focusable points and
// an aria-live readout — not just a title attribute tooltip.
function AverageByMonthChart({ months }: { months: { key: string; label: string; avg: number; count: number }[] }) {
  const { t } = useApp();
  const [hover, setHover] = useState<{ label: string; avg: number; count: number } | null>(null);
  const W = 300, H = 100;
  const pts = months.map((m, i) => ({
    ...m,
    x: months.length > 1 ? 18 + (i * (W - 36)) / (months.length - 1) : W / 2,
    y: H - 16 - ((Math.max(1, Math.min(5, m.avg)) - 1) / 4) * (H - 32),
  }));
  return (
    <>
      <svg className="lc" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('history.monthlyChartAriaLabel')}>
        {pts.length > 1 && (
          <polyline points={pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')} fill="none" stroke="var(--acct)" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
        )}
        {pts.map((p) => (
          <circle
            key={p.key}
            className="sp"
            tabIndex={0}
            cx={p.x.toFixed(1)}
            cy={p.y.toFixed(1)}
            r={6}
            fill="var(--acct)"
            onMouseEnter={() => setHover(p)}
            onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(p)}
            onBlur={() => setHover(null)}
          />
        ))}
      </svg>
      <div className="axis sp6" aria-hidden="true">{months.map((m) => <span key={m.key}>{m.label}</span>)}</div>
      <div className="calread" aria-live="polite" style={{ minHeight: 0, padding: '8px 12px', marginTop: 8 }}>
        {hover ? t('history.monthlyHoverValue', { label: hover.label, avg: hover.avg.toFixed(1), count: hover.count }) : t('history.monthlyHoverHint')}
      </div>
    </>
  );
}

export function HistoryScreen(_props: { device: Device }) {
  const { state, t, language, me, albums, liveAlbums, spotifyCovers, myRatings, albumRatings, setHistoryQuery, showScreen, openAlbum, goBack } = useApp();
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('newest');

  const filtered = useMemo(() => {
    const q = (state.historyQuery || '').trim().toLowerCase();
    let list = myRatings;
    if (q) {
      list = list.filter((r) => {
        const a = albums.find((x) => x.id === r.albumId);
        return a ? (a.title + ' ' + a.artist + ' ' + r.tags.join(' ')).toLowerCase().includes(q) : false;
      });
    }
    if (filter === 'high') list = list.filter((r) => r.stars >= 4.5);
    else if (filter === 'low') list = list.filter((r) => r.stars < 3);
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
  const scoreMode = (scoreBuckets.indexOf(Math.max(...scoreBuckets)) + 1) / 10;

  const byMonth = useMemo(() => {
    const map = new Map<string, { sum: number; count: number; label: string; date: Date }>();
    for (const r of myRatings) {
      const d = new Date(r.createdAt);
      const k = monthKey(r.createdAt);
      const cur = map.get(k) || { sum: 0, count: 0, label: d.toLocaleDateString(toLocale(language), { month: 'short' }), date: d };
      cur.sum += r.stars;
      cur.count += 1;
      map.set(k, cur);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [myRatings, language]);
  // "Average by month": last 6 months that actually have a rating.
  const avgByMonth = useMemo(() => byMonth.slice(-6).map(([key, v]) => ({ key, label: v.label, avg: v.sum / v.count, count: v.count })), [byMonth]);
  // "Ratings per month": every month that has one, uncapped, by count.
  const countByMonth = useMemo(() => byMonth.map(([key, v]) => ({ key, label: v.label, avg: v.sum / v.count, count: v.count })), [byMonth]);
  const maxMonthCount = Math.max(1, ...countByMonth.map((m) => m.count));

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
  const albumTitle = (albumId: string) => albumFor(albumId)?.title ?? albumId;

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
      <button className="crumb" onClick={() => goBack('profile')}>‹ {t('profile.friends')}</button>
      <p className="eyebrow muted">{t('history.eyebrow')}</p>
      <h1 className="big">{t('history.title')}</h1>
      <p style={{ fontWeight: 800, margin: '-6px 0 18px' }}>
        {t('history.summary', { count: myRatings.length, albumWord: pluralForKey(language, myRatings.length, 'history.albumOne', 'history.albumFew', 'history.albumMany'), reviewed: habits.reviewed })}
      </p>

      <div className="bento b3">
        <div className="tile t-ac s2">
          <span className="num" style={{ fontSize: 'clamp(90px,18vw,160px)', display: 'block' }}>{avgScore.toFixed(1)}</span>
          <p style={{ fontWeight: 800, marginTop: 12 }}>{t('history.heroCaption', { count: myRatings.length })}</p>
        </div>

        <div className="stack">
          <div className="tile t-pop">
            <span className="num" style={{ fontSize: 44 }}>{vsEveryone >= 0 ? '+' : '−'}{Math.abs(vsEveryone).toFixed(1)}</span>
            <br /><small style={{ fontWeight: 700 }}>{t('history.vsEveryoneCaption')}</small>
          </div>
          <div className="tile t-ink">
            <span className="num" style={{ fontSize: 44 }}>{revisedRatings.length}</span>
            <br /><small style={{ fontWeight: 700 }}>{pluralForKey(language, revisedRatings.length, 'history.scoreRevisedOne', 'history.scoreRevisedFew', 'history.scoreRevisedMany')}</small>
          </div>
        </div>

        <div className="tile s2">
          <h2>{t('history.scoreDistTitle')}</h2>
          {myRatings.length ? (
            <>
              <div className="h50" style={{ marginTop: 10 }}>
                {scoreBuckets.map((n, i) => <i key={i} style={{ height: n ? `${Math.max(6, (n / maxBucket) * 100)}%` : '2%' }} title={`${((i + 1) / 10).toFixed(1)} ★ · ${n}`} />)}
              </div>
              <div className="h50ax"><span>0.1</span><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span></div>
              <p className="muted" style={{ marginTop: 10, fontSize: 14, fontWeight: 600 }}>{t('history.scoreDistModeCaption', { mode: scoreMode.toFixed(1) })}</p>
            </>
          ) : <p className="muted">{t('history.notEnoughForChart')}</p>}
        </div>

        <div className="tile t-soft2">
          <h2>{t('history.monthlySparkTitle')}</h2>
          {avgByMonth.length >= 2 ? <AverageByMonthChart months={avgByMonth} /> : <p className="muted">{t('history.notEnoughForChart')}</p>}
        </div>

        <div className="tile">
          <h2>{t('history.ratingsPerMonthTitle')}</h2>
          {countByMonth.length ? (
            <div className="mbars">
              {countByMonth.map((m) => (
                <div key={m.key}>
                  <i style={{ height: `${Math.round((m.count / maxMonthCount) * 84)}%` }} />
                  <small>{m.label}<br />{m.count} · {m.avg.toFixed(1)}</small>
                </div>
              ))}
            </div>
          ) : <p className="muted">{t('history.notEnoughForChart')}</p>}
        </div>

        <div className="tile">
          <h2>{t('history.highlightsTitle')}</h2>
          {highlights ? (
            <div className="stack" style={{ marginTop: 10 }}>
              <button className="row" onClick={() => openAlbum(highlights.highest.albumId)}>
                <CoverArt url={spotifyCovers[highlights.highest.albumId] || albumFor(highlights.highest.albumId)?.cover} fallbackLetter={albumFor(highlights.highest.albumId)?.artist[0] || '?'} className="cov" style={{ width: 48, height: 48 }} />
                <div className="g"><b>{t('history.highestRated')}</b><small className="muted" style={{ fontWeight: 600 }}>{albumTitle(highlights.highest.albumId)}</small></div>
                <span className="num" style={{ fontSize: 26, color: 'var(--acct)' }}>{highlights.highest.stars.toFixed(1)}</span>
              </button>
              <button className="row" onClick={() => openAlbum(highlights.lowest.albumId)}>
                <CoverArt url={spotifyCovers[highlights.lowest.albumId] || albumFor(highlights.lowest.albumId)?.cover} fallbackLetter={albumFor(highlights.lowest.albumId)?.artist[0] || '?'} className="cov" style={{ width: 48, height: 48 }} />
                <div className="g"><b>{t('history.lowestRated')}</b><small className="muted" style={{ fontWeight: 600 }}>{albumTitle(highlights.lowest.albumId)}</small></div>
                <span className="num" style={{ fontSize: 26 }}>{highlights.lowest.stars.toFixed(1)}</span>
              </button>
              {highlights.changedMind && (
                <button className="row" onClick={() => openAlbum(highlights.changedMind!.albumId)}>
                  <CoverArt url={spotifyCovers[highlights.changedMind.albumId] || albumFor(highlights.changedMind.albumId)?.cover} fallbackLetter={albumFor(highlights.changedMind.albumId)?.artist[0] || '?'} className="cov" style={{ width: 48, height: 48 }} />
                  <div className="g"><b>{t('history.changedMind')}</b><small className="muted" style={{ fontWeight: 600 }}>{albumTitle(highlights.changedMind.albumId)}</small></div>
                  <span className="rev">{highlights.changedMind.previousStars!.toFixed(1)} → {highlights.changedMind.stars.toFixed(1)}</span>
                </button>
              )}
            </div>
          ) : <p className="muted">{t('history.notEnoughForChart')}</p>}
        </div>

        <div className="tile t-pop">
          <h2>{t('history.habitsTitle')}</h2>
          <div className="row"><span className="g"><b>{t('history.reviewsWritten')}</b></span><b>{habits.reviewed} / {habits.total}</b></div>
          <div className="meter" style={{ margin: '2px 0 10px' }}><i style={{ width: `${habits.total ? (habits.reviewed / habits.total) * 100 : 0}%` }} /></div>
          <div className="row"><span className="g"><b>{t('history.keptPrivateLabel')}</b></span><b>{habits.privateCount}</b></div>
          <div className="row"><span className="g"><b>{t('history.favouriteTags')}</b></span></div>
          <div className="chips" style={{ margin: 0 }}>
            {habits.topTags.length ? habits.topTags.map(([id, count]) => (
              <span key={id} className="chip">{t(REVIEW_TAG_LABEL_KEY[id as keyof typeof REVIEW_TAG_LABEL_KEY])} · {count}</span>
            )) : <span className="muted">{t('history.noTagsYet')}</span>}
          </div>
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
            const label = new Date(rows[0].createdAt).toLocaleDateString(toLocale(language), { month: 'long', year: 'numeric' });
            return (
              <div className="tile" key={key} style={{ marginBottom: 14 }}>
                <div className="setrow" style={{ border: 0, padding: 0, marginBottom: 6, alignItems: 'baseline' }}>
                  <h2 style={{ margin: 0 }}>{label}</h2>
                  <small className="muted" style={{ fontWeight: 700 }}>{t('history.monthSummary', { count: rows.length, avg: avg.toFixed(1) })}</small>
                </div>
                <div className="stack">{rows.map((r) => <HistoryRow key={r.albumId} rating={r} />)}</div>
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
          <button className="btn ghost" disabled={!myRatings.length} onClick={() => exportCsv(myRatings, albums, liveAlbums)}>{t('history.exportBtn')}</button>
        </div>
      </div>
    </>
  );
}
