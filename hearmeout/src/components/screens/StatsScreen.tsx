'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '@/lib/AppContext';
import type { Device, StatsCalendarDay, StatsData, StatsPeriodType, StatsSeasonKey } from '@/lib/types';
import { CoverArt } from '../ui/CoverArt';
import { BookmarkIcon, HeartIcon } from '../ui/Icons';
import { usePlayer } from '@/lib/PlayerContext';
import type { AlbumDetail } from '@/lib/spotifyCatalog';
import { toLocale, type Language } from '@/lib/i18n';
import type { WeekStart } from '@/lib/palettes';
import { formatHour, formatRelative } from '@/lib/format';
import { recapLine } from '@/lib/recapLine';
import { completedWeekRange, isoWeekNumber } from '@/lib/weeks';

type T = ReturnType<typeof useApp>['t'];

// Day / month names and durations in the interface language (the API's own
// labels are English placeholders).
const wdShort = (d: Date, lang: Language) => d.toLocaleDateString(toLocale(lang), { weekday: 'short', timeZone: 'UTC' });
const monShort = (d: Date, lang: Language) => d.toLocaleDateString(toLocale(lang), { month: 'short', timeZone: 'UTC' });
const dayLabelOf = (d: Date, lang: Language) => d.toLocaleDateString(toLocale(lang), { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
function durLong(min: number, t: T): string {
  const h = Math.floor(min / 60), m = min % 60;
  return h ? `${h} ${t('unit.h')}${m ? ` ${m} ${t('unit.m')}` : ''}` : `${m} ${t('unit.m')}`;
}
function durShort(min: number, t: T): string {
  if (!min) return '–';
  const h = Math.floor(min / 60), m = min % 60;
  return h ? `${h}${t('unit.h')}${String(m).padStart(2, '0')}` : `${m}${t('unit.m')}`;
}
function level(minutes: number): number {
  if (minutes === 0) return 0;
  if (minutes < 60) return 1;
  if (minutes < 120) return 2;
  if (minutes < 240) return 3;
  return 4;
}
function parseDay(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function ListeningCalendar({ data, t, language, weekStart }: { data: StatsData; t: T; language: Language; weekStart: WeekStart }) {
  const { periodType, calendar } = data;
  const scrollRef = useRef<HTMLDivElement>(null);
  const calRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => setSelected(null), [data.periodLabel, periodType]);

  // Local calendar date, not UTC (redesign fix, item 22) — toISOString()
  // shifts to UTC first, so anyone west of Greenwich in the evening, or
  // east of it past midnight UTC, got "today" highlighted a day off.
  const todayKey = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);
  const inPeriodToday = calendar.days.some((d) => d.date === todayKey && !d.future);
  const fallbackReadout = inPeriodToday ? calendar.days.find((d) => d.date === todayKey) : calendar.bestDay;
  const readoutDay: StatsCalendarDay | { date: string; minutes: number; tracks: number; topArtist: string | null } | null =
    (selected && calendar.days.find((d) => d.date === selected)) || fallbackReadout || null;

  const fit = () => {
    const sc = scrollRef.current, cal = calRef.current;
    if (!sc || !cal) return;
    const w = Number(sc.dataset.w || 0);
    if (!w) return;
    const gap = window.innerWidth < 1000 ? 3 : 4;
    const mx = Number(sc.dataset.max || 34);
    const avail = sc.clientWidth;
    const cs = Math.max(12, Math.min(mx, Math.floor((avail - (w - 1) * gap) / w)));
    cal.style.setProperty('--cs', `${cs}px`);
    cal.style.setProperty('--cg', `${gap}px`);
    cal.classList.toggle('nonum', cs < 26);
  };
  useEffect(() => {
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
     
  }, [data]);

  const dayLabel = (d: Date) => dayLabelOf(d, language);
  const dayBtn = (d: StatsCalendarDay, cls: string, inner: React.ReactNode) => (
    <button
      key={d.date}
      className={`cd ${cls} l${level(d.minutes)}${d.date === todayKey ? ' today' : ''}${selected === d.date ? ' sel' : ''}`}
      onClick={() => setSelected(d.date)}
      aria-label={`${dayLabel(parseDay(d.date))}: ${d.minutes ? durLong(d.minutes, t) : t('stats.calNoListening')}`}
    >
      {inner}
    </button>
  );

  let gridEl: React.ReactNode;
  let gridW = 0;
  let gridMax = 34;

  if (periodType === 'week') {
    gridEl = (
      <div className="calweek">
        {calendar.days.map((d) => {
          const date = parseDay(d.date);
          const wd = <><span className="wd">{wdShort(date, language)}</span><span className="dn">{date.getUTCDate()}</span></>;
          if (d.future) return <div key={d.date} className="cd cw fut">{wd}<span className="hm">–</span></div>;
          return dayBtn(d, 'cw', <>{wd}<span className="hm">{durShort(d.minutes, t)}</span></>);
        })}
      </div>
    );
  } else {
    const first = parseDay(calendar.days[0].date);
    const firstDow = weekStart === 'mon' ? (first.getUTCDay() + 6) % 7 : first.getUTCDay();
    const leading = firstDow;
    gridW = Math.ceil((leading + calendar.days.length) / 7);
    gridMax = periodType === 'month' ? 40 : 34;
    const months: { col: number; label: string }[] = [];
    const cells: React.ReactNode[] = [];
    for (let i = 0; i < leading; i++) cells.push(<i key={`lead-${i}`} className="cd o" />);
    calendar.days.forEach((d, idx) => {
      const col = Math.floor((leading + idx) / 7) + 1;
      const date = parseDay(d.date);
      if (date.getUTCDate() === 1 && periodType === 'season') months.push({ col, label: monShort(date, language) });
      if (d.future) { cells.push(<i key={d.date} className="cd fut"><span className="n">{date.getUTCDate()}</span></i>); return; }
      cells.push(dayBtn(d, '', <span className="n">{date.getUTCDate()}</span>));
    });
    gridEl = (
      <>
        {months.length > 0 && (
          <div className="calmonths" style={{ gridTemplateColumns: `repeat(${gridW},var(--cs))` }} aria-hidden="true">
            {months.map((m, i) => <span key={i} style={{ gridColumn: m.col }}>{m.label}</span>)}
          </div>
        )}
        <div className="calgrid" style={{ gridTemplateColumns: `repeat(${gridW},var(--cs))` }}>{cells}</div>
      </>
    );
  }

  return (
    <div className="tile s3">
      <h2>{t('stats.calendarTitle')}</h2>
      <p className="muted" style={{ margin: '-6px 0 18px', fontWeight: 600 }}>{t('stats.calendarHelp')}</p>
      <div className="cal" ref={calRef}>
        <div className="calstats">
          <div><span className="num">{calendar.activeDays}<small className="muted" style={{ fontSize: 15, fontWeight: 700 }}> / {calendar.totalDays}</small></span><small>{t('stats.calDaysListened')}</small></div>
          <div><span className="num">{calendar.longestStreak}</span><small>{t('stats.calLongestStreak')}</small></div>
          <div><span className="num">{calendar.bestDay ? durLong(calendar.bestDay.minutes, t) : '–'}</span><small>{calendar.bestDay ? `${t('stats.calBestDay')} · ${dayLabel(parseDay(calendar.bestDay.date))}` : t('stats.calBestDay')}</small></div>
        </div>
        <div className="calscroll" ref={scrollRef} data-w={gridW} data-max={gridMax}>{gridEl}</div>
        <div className="calread" aria-live="polite">
          {readoutDay ? (
            readoutDay.minutes === 0 ? (
              <><span className="d">{dayLabel(parseDay(readoutDay.date))}</span><span className="muted">{t('stats.calNoListening')}</span></>
            ) : (
              <><span className="d">{dayLabel(parseDay(readoutDay.date))}</span><span className="big">{durLong(readoutDay.minutes, t)}</span><span className="muted">{t('stats.calTracksMostPlayed', { tracks: readoutDay.tracks, artist: readoutDay.topArtist || '—' })}</span></>
            )
          ) : <span className="muted">{t('stats.calNoListening')}</span>}
        </div>
        <div className="callegend">
          <span>{t('stats.calLegendLabel')}</span>
          {[['0', 0], [`<1${t('unit.h')}`, 1], [`1–2${t('unit.h')}`, 2], [`2–4${t('unit.h')}`, 3], [`4${t('unit.h')}+`, 4]].map(([label, l]) => (
            <div key={l}><i className={`cd l${l}`} />{label}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function StatsScreen(_props: { device: Device }) {
  const { t, language, me, lovedItems, toggleLoved, openRecap, ensureRecap, recapCache, laterItems, toggleLaterTrack, showToast } = useApp();
  const { playQueue } = usePlayer();
  const [savingRow, setSavingRow] = useState<number | null>(null);

  // Listen later from Recently played (spec 13.20): a track bookmark needs
  // its album and its position in that album. Synced plays carry the
  // Spotify album id; imported history may only have the album title, which
  // is resolved to an id first. The position comes from the album's
  // tracklist (matched by track id, else title).
  const toggleRecentLater = async (p: StatsData['recentPlays'][number], row: number) => {
    const saved = laterItems.find((li) => li.type === 'track' && li.title === p.title && li.artist === p.artist);
    if (saved) { await toggleLaterTrack(saved.albumId, saved.trackIndex ?? 0, p.title, p.artist, p.cover); return; }
    setSavingRow(row);
    try {
      let albumId = p.albumId;
      if (!albumId && p.album) {
        const r = await fetch(`/api/spotify/resolve-album?title=${encodeURIComponent(p.album)}&artist=${encodeURIComponent(p.artist)}`);
        albumId = r.ok ? (await r.json()).id : null;
      }
      const detail: AlbumDetail | null = albumId ? await fetch(`/api/spotify/album/${albumId}`).then((r) => (r.ok ? r.json() : null)) : null;
      const index = detail ? detail.tracklist.findIndex((tr) => (p.trackId && tr.id === p.trackId) || tr.title.toLowerCase() === p.title.toLowerCase()) : -1;
      if (!albumId || index < 0) { showToast(t('stats.laterNoAlbum')); return; }
      await toggleLaterTrack(albumId, index, p.title, p.artist, p.cover);
    } finally {
      setSavingRow(null);
    }
  };
  const [periodType, setPeriodType] = useState<StatsPeriodType>('week');
  const [offset, setOffset] = useState(0);
  const [seasonKey, setSeasonKey] = useState<StatsSeasonKey | null>(null);
  const [data, setData] = useState<StatsData | null>(null);

  useEffect(() => { setOffset(0); setSeasonKey(null); }, [periodType]);

  // Recap tile (spec 6.5): "Your week N recap is ready", the week's real
  // generated line (lib/recapLine.ts), and it opens the weekly recap.
  useEffect(() => { if (me) ensureRecap('me', 'week'); }, [me, ensureRecap]);
  const weekRecap = me ? recapCache[`${me.id}:week`] : undefined;
  const weekRecapLine = weekRecap ? recapLine(weekRecap, language, t) : null;

  useEffect(() => {
    if (!me) return;
    let cancelled = false;
    setData(null);
    const params = new URLSearchParams({ period: periodType, weekStart: me.weekStart });
    if (periodType === 'season') { if (seasonKey) params.set('season', seasonKey); }
    else params.set('offset', String(offset));
    fetch(`/api/stats?${params}`).then((r) => (r.ok ? r.json() : null)).then((d: StatsData | null) => {
      if (cancelled) return;
      setData(d);
      if (d && periodType === 'season' && !seasonKey) {
        const cur = d.seasonChips.find((c) => c.current) || d.seasonChips[d.seasonChips.length - 1];
        if (cur) setSeasonKey(cur.key);
      }
    });
    return () => { cancelled = true; };
  }, [periodType, offset, seasonKey, me]);

  if (!me) return null;

  const maxArtistPlays = Math.max(1, ...(data?.topArtists.map((a) => a.plays) ?? [1]));
  const maxHeat = Math.max(1, ...(data?.heatmap ?? [1]));
  const maxBar = Math.max(1, ...(data?.bars.map((b) => b.hours) ?? [1]));

  const PERIOD_TYPES: { key: StatsPeriodType; label: string }[] = [
    { key: 'week', label: t('stats.periodWeek') },
    { key: 'month', label: t('stats.periodMonth') },
    { key: 'season', label: t('stats.periodSeason') },
  ];

  const periodText = (() => {
    if (!data || !data.calendar.days.length) return null;
    const loc = toLocale(language);
    const days = data.calendar.days;
    const first = parseDay(days[0].date), last = parseDay(days[days.length - 1].date);
    if (periodType === 'week') {
      const fmt = new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'short', timeZone: 'UTC' });
      return { label: fmt.formatRange(first, last), sub: offset === 0 ? t('stats.thisWeek').toLowerCase() : offset === -1 ? t('stats.lastWeek').toLowerCase() : '' };
    }
    if (periodType === 'month') {
      const label = first.toLocaleDateString(loc, { month: 'long', year: 'numeric', timeZone: 'UTC' });
      return { label: label.charAt(0).toUpperCase() + label.slice(1), sub: offset === 0 ? t('stats.thisMonth').toLowerCase() : offset === -1 ? t('stats.lastMonth').toLowerCase() : '' };
    }
    const chip = data.seasonChips.find((c) => c.key === seasonKey);
    const name = t(`season.${seasonKey === 'winterd' ? 'winter' : seasonKey}` as never);
    return { label: `${name} ${chip?.year ?? first.getUTCFullYear()}`, sub: chip?.current ? t('stats.seasonInProgress') : t('stats.seasonComplete') };
  })();
  const word = t(periodType === 'season' ? 'stats.wordSeason' : periodType === 'month' ? 'stats.wordMonth' : 'stats.wordWeek');
  const tf = me.timeFormat ?? '24';
  const peak = data?.peakHour != null ? formatHour(data.peakHour, tf) : '–';
  const GENRE_SHADE = [100, 70, 46, 28, 18, 10];
  const barsAxis = (() => {
    if (!data || !data.bars.length || !data.calendar.days.length) return null;
    const loc = toLocale(language);
    const day = (iso: string) => new Date(`${iso}T12:00:00Z`);
    const days = data.calendar.days;
    if (periodType === 'week') {
      return <div className="axis wk" aria-hidden="true">{days.map((d) => <span key={d.date}>{day(d.date).toLocaleDateString(loc, { weekday: 'short', timeZone: 'UTC' })}</span>)}</div>;
    }
    const fmt: Intl.DateTimeFormatOptions = periodType === 'month' ? { day: 'numeric', month: 'short', timeZone: 'UTC' } : { month: 'short', timeZone: 'UTC' };
    return <div className="axis" aria-hidden="true"><span>{day(days[0].date).toLocaleDateString(loc, fmt)}</span><span>{day(days[days.length - 1].date).toLocaleDateString(loc, fmt)}</span></div>;
  })();
  const deltaTxt = !data ? '' : data.comparisonNote === 'first_season' ? t('stats.firstSeason')
    : data.comparisonPct != null ? `${data.comparisonPct >= 0 ? '+' : '−'}${Math.abs(data.comparisonPct)}% ${t(periodType === 'season' ? 'stats.vsPreviousSeason' : periodType === 'month' ? (offset === 0 ? 'stats.vsLastMonth' : 'stats.vsMonthBefore') : (offset === 0 ? 'stats.vsLastWeek' : 'stats.vsWeekBefore'))}` : '';

  return (
    <>
      <p className="eyebrow muted">{me.connections.spotify ? t('stats.eyebrowSynced') : t('stats.eyebrow')}</p>
      <h1 className="big">{t('stats.title')}</h1>
      <div className="chips" role="group" aria-label={t('recap.periodLabel')}>
        {PERIOD_TYPES.map((p) => (
          <button key={p.key} className={`chip${periodType === p.key ? ' on' : ''}`} onClick={() => setPeriodType(p.key)}>{p.label}</button>
        ))}
      </div>

      <div className="pnav">
        {periodType === 'season' ? (
          <div className="chips" style={{ margin: 0 }} role="group" aria-label={t('stats.periodSeason')}>
            {(data?.seasonChips ?? []).map((c) => (
              <button key={c.key} className={`chip${seasonKey === c.key ? ' on' : ''}`} onClick={() => setSeasonKey(c.key)}>
                {t(`season.${c.key === 'winterd' ? 'winter' : c.key}` as never)}{c.current ? ` · ${t('stats.seasonNow')}` : ''}
              </button>
            ))}
          </div>
        ) : (
          <div className="segs" role="group" aria-label={t('recap.periodLabel')}>
            <button className={`chip${offset === 0 ? ' on' : ''}`} onClick={() => setOffset(0)}>{periodType === 'week' ? t('stats.thisWeek') : t('stats.thisMonth')}</button>
            <button className={`chip${offset === -1 ? ' on' : ''}`} onClick={() => setOffset(-1)}>{periodType === 'week' ? t('stats.lastWeek') : t('stats.lastMonth')}</button>
          </div>
        )}
        {data && periodText && (
          <div style={{ marginLeft: 6 }}>
            <div className="lab">{periodText.label}</div>
            <small className="muted" style={{ fontWeight: 700 }}>{periodText.sub}</small>
          </div>
        )}
      </div>

      {!data ? (
        <p className="muted" style={{ fontWeight: 600 }}>{t('stats.loading')}</p>
      ) : (
        <>
          <div className="bento b3">
            <div className="tile t-ac s2">
              <span className="num" style={{ fontSize: 'clamp(96px,20vw,170px)', display: 'block' }}>{data.hours}</span>
              <p style={{ fontWeight: 800, marginTop: 12 }}>{t('stats.hoursOfMusic')}{deltaTxt ? ` · ${deltaTxt}` : ''}</p>
            </div>
            <div className="stack">
              <div className="tile t-pop"><span className="num" style={{ fontSize: 44 }}>{data.trackCount.toLocaleString(toLocale(language))}</span><br /><small style={{ fontWeight: 700 }}>{t('stats.tracks')}</small></div>
              <div className="tile t-ink"><span className="num" style={{ fontSize: 44 }}>{data.artistCount}</span><br /><small style={{ fontWeight: 700 }}>{t('stats.artistsNew', { count: data.newArtistCount })}</small></div>
            </div>

            <div className="s3 stats3" style={{ margin: 0 }}>
              <div className="tile t-soft2"><span className="num">{data.avgRating ? Number(data.avgRating).toFixed(1) : '–'}</span><small>{t('stats.avgRatingIn', { word })}</small></div>
              <div className="tile"><span className="num" style={{ color: 'var(--acct)' }}>{peak}</span><small>{t('stats.peakHour')}</small></div>
              <div className="tile t-pop"><span className="num">{data.topArtists.length}</span><small>{t('stats.artistsTracked')}</small></div>
            </div>

            <ListeningCalendar data={data} t={t} language={language} weekStart={me.weekStart ?? 'mon'} />

            <div className="tile">
              <h2>{periodType === 'season' ? t('stats.hoursPerWeek') : t('stats.hoursPerDay')}</h2>
              <div className={`bars${periodType === 'month' ? ' dense' : ''}`} role="img" aria-label={periodType === 'season' ? t('stats.hoursPerWeek') : t('stats.hoursPerDay')}>
                {data.bars.map((b, i) => <i key={i} style={{ height: `${Math.max(3, Math.round((b.hours / maxBar) * 100))}%`, opacity: b.future ? 0.25 : 1 }} title={`${b.label}: ${b.hours}h`} />)}
              </div>
              {barsAxis}
            </div>

            <div className="tile t-soft2">
              <h2>{t('stats.topArtists')}</h2>
              {data.topArtists.length ? data.topArtists.slice(0, 4).map((a, i) => (
                <div className="row" key={a.id || a.name}>
                  <span className="num" style={{ fontSize: 24, width: 18 }}>{i + 1}</span>
                  <b className="g">{a.name}</b>
                  <div className="meter" style={{ flex: 'none', width: 80 }}><i style={{ width: `${Math.round((a.plays / maxArtistPlays) * 100)}%` }} /></div>
                  <b style={{ width: 36, textAlign: 'right' }}>{a.plays}</b>
                </div>
              )) : <p className="muted" style={{ fontWeight: 600 }}>{t('stats.notEnough')}</p>}
              <p className="muted" style={{ fontSize: 13, fontWeight: 600, marginTop: 8 }}>{t('stats.playsInThis', { word })}</p>
            </div>

            <div className="tile">
              <h2>{t('stats.whenYouListen')}</h2>
              <div className="tod" role="img" aria-label={t('stats.todAria', { hour: peak })}>
                {data.heatmap.map((n, h) => <i key={h} className={h === data.peakHour ? 'pk' : ''} style={{ height: `${Math.max(4, Math.round((n / maxHeat) * 100))}%` }} title={formatHour(h, tf)} />)}
              </div>
              <div className="todax" aria-hidden="true">{[0, 6, 12, 18, 23].map((h) => <span key={h}>{formatHour(h, tf)}</span>)}</div>
              {data.peakHour != null && <p className="muted" style={{ marginTop: 10, fontSize: 14, fontWeight: 600 }}>{t('stats.peakSentencePre')} <b>{peak}</b>.</p>}
            </div>

            {data.genreSplit.length > 0 && (
              <div className="tile s3">
                <h2>{t('stats.genreSplit')}</h2>
                <div className="gbar" role="img" aria-label={t('stats.genreSplit')}>
                  {data.genreSplit.map((g, i) => (
                    <i key={g.genre} style={{ flex: g.pct, background: `color-mix(in srgb, var(--acct) ${GENRE_SHADE[i] ?? 10}%, var(--paper))` }} />
                  ))}
                </div>
                <div className="glegend">
                  {data.genreSplit.map((g, i) => (
                    <span key={g.genre}><i style={{ background: `color-mix(in srgb, var(--acct) ${GENRE_SHADE[i] ?? 10}%, var(--paper))` }} />{g.genre} <b>{g.pct}%</b></span>
                  ))}
                </div>
              </div>
            )}

            <div className="tile s2">
              <h2>{t('stats.recentPlays')}</h2>
              <p className="muted" style={{ fontWeight: 600, margin: '-6px 0 6px' }}>{t('stats.recentPlaysHint')}</p>
              {data.recentPlays.length ? data.recentPlays.map((p, i) => {
                const loved = lovedItems.some((li) => li.type === 'track' && li.title === p.title && li.artist === p.artist);
                const later = laterItems.some((li) => li.type === 'track' && li.title === p.title && li.artist === p.artist);
                return (
                  <div className="row" key={i}>
                    <button className="rowlink" onClick={() => playQueue([{ title: p.title, artist: p.artist, cover: p.cover, albumId: p.albumId }], 0)} aria-label={t('album.playPreviewOf', { title: p.title })}>
                      <CoverArt url={p.cover ?? undefined} fallbackLetter={p.artist[0] || '?'} className="cov" style={{ width: 44, height: 44 }} />
                      <span className="g"><b>{p.title}</b><small className="muted" style={{ fontWeight: 600 }}>{p.artist} · {formatRelative(p.playedAt, language)}</small></span>
                    </button>
                    <button className={`ib love${loved ? ' on' : ''}`} aria-pressed={loved} onClick={() => toggleLoved('track', p.title, p.artist, p.trackId, p.cover)} aria-label={loved ? t('album.removeFromLoved') : t('album.addToLoved')}>
                      <HeartIcon />
                    </button>
                    <button className={`ib love later${later ? ' on' : ''}`} aria-pressed={later} disabled={savingRow === i} onClick={() => toggleRecentLater(p, i)} aria-label={later ? t('track.removeLater') : t('track.saveLater')}>
                      <BookmarkIcon />
                    </button>
                  </div>
                );
              }) : <p className="muted" style={{ fontWeight: 600 }}>{t('stats.notEnough')}</p>}
            </div>
          </div>

          <div className="sec">
            <button className="tile t-ac" style={{ textAlign: 'left', width: '100%', display: 'flex', gap: 16, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }} onClick={() => openRecap('me', 'week')}>
              <div>
                <span className="pill">{t('stats.recapLinkEyebrow')}</span>
                <h2 style={{ margin: '14px 0 4px' }}>{t('stats.recapWeekTitle', { n: isoWeekNumber(completedWeekRange(0, me.weekStart).start) })}</h2>
                {weekRecapLine && <p style={{ fontWeight: 700 }}>“{weekRecapLine.lead}{weekRecapLine.em ? ` ${weekRecapLine.em}` : ''}”</p>}
              </div>
              <span style={{ fontWeight: 800 }}>{t('stats.recapLinkCta')} →</span>
            </button>
          </div>
        </>
      )}
    </>
  );
}
