'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '@/lib/AppContext';
import type { Device, StatsCalendarDay, StatsData, StatsPeriodType, StatsSeasonKey } from '@/lib/types';
import { CoverArt } from '../ui/CoverArt';
import { HeartIcon } from '../ui/Icons';
import { toLocale, pluralForKey, type Language } from '@/lib/i18n';
import type { WeekStart } from '@/lib/palettes';
import { formatHour } from '@/lib/format';
import { recapLine } from '@/lib/recapLine';
import { completedWeekRange, isoWeekNumber } from '@/lib/weeks';

const DN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function durLong(min: number): string {
  const h = Math.floor(min / 60), m = min % 60;
  return h ? `${h}h ${m ? m + 'm' : ''}`.trim() : `${m}m`;
}
function durShort(min: number): string {
  if (!min) return '–';
  const h = Math.floor(min / 60), m = min % 60;
  return h ? `${h}h${String(m).padStart(2, '0')}` : `${m}m`;
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

function ListeningCalendar({ data, t, language, weekStart }: { data: StatsData; t: ReturnType<typeof useApp>['t']; language: Language; weekStart: WeekStart }) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const dayLabel = (d: Date) => `${DN[d.getUTCDay()]} ${d.getUTCDate()} ${MN[d.getUTCMonth()]}`;
  const dayBtn = (d: StatsCalendarDay, cls: string, inner: React.ReactNode) => (
    <button
      key={d.date}
      className={`cd ${cls} l${level(d.minutes)}${d.date === todayKey ? ' today' : ''}${selected === d.date ? ' sel' : ''}`}
      onClick={() => setSelected(d.date)}
      aria-label={`${dayLabel(parseDay(d.date))}: ${d.minutes ? durLong(d.minutes) : t('stats.calNoListening')}`}
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
          const wd = <><span className="wd">{DN[date.getUTCDay()]}</span><span className="dn">{date.getUTCDate()}</span></>;
          if (d.future) return <div key={d.date} className="cd cw fut">{wd}<span className="hm">–</span></div>;
          return dayBtn(d, 'cw', <>{wd}<span className="hm">{durShort(d.minutes)}</span></>);
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
      if (date.getUTCDate() === 1 && periodType === 'season') months.push({ col, label: MN[date.getUTCMonth()] });
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
      <h3>{t('stats.calendarTitle')}</h3>
      <p className="muted">{t('stats.calendarHelp')}</p>
      <div className="cal" ref={calRef} style={{ marginTop: 10 }}>
        <div className="calstats">
          <div><span className="num">{calendar.activeDays}<small className="muted" style={{ fontSize: 15, fontWeight: 700 }}> / {calendar.totalDays}</small></span><small>{t('stats.calDaysListened')}</small></div>
          <div><span className="num">{calendar.longestStreak}</span><small>{t('stats.calLongestStreak')}</small></div>
          <div><span className="num">{calendar.bestDay ? durLong(calendar.bestDay.minutes) : '–'}</span><small>{calendar.bestDay ? `${t('stats.calBestDay')} · ${dayLabel(parseDay(calendar.bestDay.date))}` : t('stats.calBestDay')}</small></div>
        </div>
        <div className="calscroll" ref={scrollRef} data-w={gridW} data-max={gridMax}>{gridEl}</div>
        <div className="calread" aria-live="polite">
          {readoutDay ? (
            readoutDay.minutes === 0 ? (
              <><span className="d">{dayLabel(parseDay(readoutDay.date))}</span><span className="muted">{t('stats.calNoListening')}</span></>
            ) : (
              <><span className="d">{dayLabel(parseDay(readoutDay.date))}</span><span className="big">{durLong(readoutDay.minutes)}</span><span className="muted">{t('stats.calTracksMostPlayed', { tracks: readoutDay.tracks, artist: readoutDay.topArtist || '—' })}</span></>
            )
          ) : <span className="muted">{t('stats.calNoListening')}</span>}
        </div>
        <div className="callegend">
          <span>{t('stats.calLegendLabel')}</span>
          {[['0', 0], ['<1h', 1], ['1–2h', 2], ['2–4h', 3], ['4h+', 4]].map(([label, l]) => (
            <div key={l}><i className={`cd l${l}`} />{label}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function StatsScreen(_props: { device: Device }) {
  const { t, language, me, lovedItems, toggleLoved, openRecap, ensureRecap, recapCache } = useApp();
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

  const maxArtistHours = Math.max(1, ...(data?.topArtists.map((a) => a.hours) ?? [1]));
  const maxHeat = Math.max(1, ...(data?.heatmap ?? [1]));
  const maxBar = Math.max(1, ...(data?.bars.map((b) => b.hours) ?? [1]));

  const PERIOD_TYPES: { key: StatsPeriodType; label: string }[] = [
    { key: 'week', label: t('stats.periodWeek') },
    { key: 'month', label: t('stats.periodMonth') },
    { key: 'season', label: t('stats.periodSeason') },
  ];

  return (
    <>
      <div className="eyebrow">{t('stats.eyebrow')}</div>
      <h1 className="big">{t('stats.title')}</h1>
      <div className="chips">
        {PERIOD_TYPES.map((p) => (
          <button key={p.key} className={`chip ${periodType === p.key ? 'on' : ''}`} onClick={() => setPeriodType(p.key)}>{p.label}</button>
        ))}
      </div>

      {periodType === 'season' ? (
        data && data.seasonChips.length > 0 && (
          <div className="chips" style={{ marginTop: 8 }}>
            {data.seasonChips.map((c) => (
              <button key={c.key} className={`chip ${seasonKey === c.key ? 'on' : ''}`} onClick={() => setSeasonKey(c.key)}>
                {t(`season.${c.key === 'winterd' ? 'winter' : c.key}` as never)}{c.current ? ` · ${t('stats.seasonNow')}` : ''}
              </button>
            ))}
          </div>
        )
      ) : (
        <div className="chips" style={{ marginTop: 8 }}>
          <button className={`chip ${offset === 0 ? 'on' : ''}`} onClick={() => setOffset(0)}>{periodType === 'week' ? t('stats.thisWeek') : t('stats.thisMonth')}</button>
          <button className={`chip ${offset === -1 ? 'on' : ''}`} onClick={() => setOffset(-1)}>{periodType === 'week' ? t('stats.lastWeek') : t('stats.lastMonth')}</button>
        </div>
      )}
      {data && <p className="muted" style={{ marginTop: 6 }}>{data.periodLabel} · {data.periodSub}</p>}

      {!data ? (
        <p className="muted">{t('stats.loading')}</p>
      ) : data.trackCount === 0 && data.calendar.activeDays === 0 ? (
        <div className="tile empty">
          <p>{t('stats.empty')}</p>
        </div>
      ) : (
        <>
          <div className="bento b3">
            <div className="tile t-ac s2">
              <span className="num" style={{ fontSize: 'clamp(96px,20vw,170px)', display: 'block' }}>{data.hours}</span>
              <p style={{ fontWeight: 800, marginTop: 12 }}>
                {t('stats.hoursOfMusic')}
                {data.comparisonNote === 'first_season' ? ` · ${t('stats.firstSeason')}` : data.comparisonPct != null ? ` · ${data.comparisonPct >= 0 ? '+' : '−'}${Math.abs(data.comparisonPct)}% ${t(periodType === 'season' ? 'stats.vsPreviousSeason' : periodType === 'month' ? (offset === 0 ? 'stats.vsLastMonth' : 'stats.vsMonthBefore') : (offset === 0 ? 'stats.vsLastWeek' : 'stats.vsWeekBefore'))}` : ''}
              </p>
            </div>
            <div className="tile">
              <div className="stack">
                <div><span className="num">{data.trackCount.toLocaleString(toLocale(language))}</span><small className="muted">{t('stats.tracks')}</small></div>
                <div><span className="num">{data.artistCount}</span><small className="muted">{t('stats.artistsNew', { count: data.newArtistCount })}</small></div>
              </div>
            </div>

            <div className="tile"><span className="num">{data.avgRating || '—'}</span><small className="muted">{t(periodType === 'season' ? 'stats.avgRatingSeason' : periodType === 'month' ? 'stats.avgRatingMonth' : 'stats.avgRatingWeek')}</small></div>
            <div className="tile"><span className="num">{data.peakHour != null ? formatHour(data.peakHour, me?.timeFormat ?? '24') : '—'}</span><small className="muted">{t('stats.peakHour')}</small></div>
            <div className="tile"><span className="num">{data.topArtists.length}</span><small className="muted">{t('stats.artistsTracked')}</small></div>

            <ListeningCalendar data={data} t={t} language={language} weekStart={me?.weekStart ?? 'mon'} />

            <div className="tile">
              <h3>{periodType === 'season' ? t('stats.hoursPerWeek') : t('stats.hoursPerDay')}</h3>
              {data.bars.length ? (
                <>
                  <div className="bars" style={{ marginTop: 10 }}>
                    {data.bars.map((b, i) => <i key={i} style={{ height: b.hours ? `${Math.max(6, (b.hours / maxBar) * 100)}%` : '2%', opacity: b.future ? 0.25 : 1 }} title={`${b.label}: ${b.hours}h`} />)}
                  </div>
                  <div className="axis">
                    {data.bars.map((b, i) => {
                      const step = data.bars.length > 10 ? Math.ceil(data.bars.length / 6) : 1;
                      return <span key={i}>{i % step === 0 || i === data.bars.length - 1 ? b.label : ''}</span>;
                    })}
                  </div>
                </>
              ) : <p className="muted">{t('stats.notEnough')}</p>}
            </div>

            <div className="tile">
              <h3>{t('stats.topArtists')}</h3>
              <div className="stack" style={{ marginTop: 10 }}>
                {data.topArtists.length ? data.topArtists.slice(0, 4).map((a, i) => (
                  <div className="row" key={a.id || a.name}>
                    <span className="muted" style={{ width: 20 }}>{i + 1}</span>
                    <CoverArt url={a.cover ?? undefined} fallbackLetter={a.name[0] || '?'} className="cov" style={{ width: 36, height: 36 }} />
                    <div className="g">
                      <b>{a.name}</b>
                      <div className="meter" style={{ marginTop: 4 }}><i style={{ width: `${(a.hours / maxArtistHours) * 100}%` }} /></div>
                    </div>
                    <small className="muted">{t('stats.playsCount', { count: a.plays })}</small>
                  </div>
                )) : <p className="muted">{t('stats.notEnough')}</p>}
              </div>
            </div>

            <div className="tile">
              <h3>{t('stats.whenYouListen')}</h3>
              <div className="tod" style={{ marginTop: 10 }}>
                {data.heatmap.map((n, h) => <i key={h} className={n === maxHeat && n > 0 ? 'pk' : ''} style={{ height: `${Math.max(4, (n / maxHeat) * 100)}%` }} title={`${formatHour(h, me?.timeFormat ?? '24')} — ${n}`} />)}
              </div>
              <div className="todax"><span>00</span><span>06</span><span>12</span><span>18</span><span>23</span></div>
              {data.peakHour != null && <p className="muted" style={{ marginTop: 6 }}>{t('stats.peakSentence', { hour: formatHour(data.peakHour, me?.timeFormat ?? '24') })}</p>}
            </div>

            {data.genreSplit.length > 0 && (
              <div className="tile s3">
                <h3>{t('stats.genreSplit')}</h3>
                <div className="gbar" style={{ marginTop: 10 }}>
                  {data.genreSplit.map((g, i) => (
                    <i key={g.genre} style={{ width: `${g.pct}%`, background: `color-mix(in srgb, var(--acct) ${100 - i * 15}%, transparent)` }} />
                  ))}
                </div>
                <div className="glegend">
                  {data.genreSplit.map((g, i) => (
                    <span key={g.genre}><i style={{ background: `color-mix(in srgb, var(--acct) ${100 - i * 15}%, transparent)` }} />{g.genre} · {g.pct}%</span>
                  ))}
                </div>
              </div>
            )}

            <div className="tile s2">
              <h3>{t('stats.recentPlays')}</h3>
              <p className="muted" style={{ fontWeight: 600, margin: '-6px 0 6px' }}>{t('stats.recentPlaysHint')}</p>
              <div className="stack" style={{ marginTop: 10 }}>
                {data.recentPlays.length ? data.recentPlays.map((p, i) => {
                  const loved = lovedItems.some((li) => li.type === 'track' && li.title === p.title && li.artist === p.artist);
                  return (
                    <div className="row" key={i}>
                      <CoverArt url={p.cover ?? undefined} fallbackLetter={p.artist[0] || '?'} className="cov" style={{ width: 36, height: 36 }} />
                      <div className="g"><b>{p.title}</b><div className="muted">{p.artist} · {new Date(p.playedAt).toLocaleString(toLocale(language), { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: me?.timeFormat === '12' })}</div></div>
                      <button className={`ib love${loved ? ' on' : ''}`} onClick={() => toggleLoved('track', p.title, p.artist, p.trackId, p.cover)} aria-label={t('stats.loveTrack')}>
                        <HeartIcon />
                      </button>
                    </div>
                  );
                }) : <p className="muted">{t('stats.notEnough')}</p>}
              </div>
            </div>
          </div>

          <button className="tile t-ac" style={{ textAlign: 'left', width: '100%', marginTop: 14 }} onClick={() => openRecap('me', 'week')}>
            <span className="pill">{t('stats.recapLinkEyebrow')}</span>
            <h2 style={{ margin: '14px 0 4px' }}>{me ? t('stats.recapWeekTitle', { n: isoWeekNumber(completedWeekRange(0, me.weekStart).start) }) : ''}</h2>
            {weekRecapLine && <p style={{ fontWeight: 700 }}>“{weekRecapLine.lead}{weekRecapLine.em ? ` ${weekRecapLine.em}` : ''}”</p>}
            <span style={{ fontWeight: 800 }}>{t('stats.recapLinkCta')} →</span>
          </button>
        </>
      )}
    </>
  );
}
