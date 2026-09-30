'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { useApp } from '@/lib/AppContext';
import type { Device, StatsData, StatsRange } from '@/lib/types';
import { CoverArt } from '../ui/CoverArt';
import { HeartIcon } from '../ui/Icons';
import { toLocale, type Language } from '@/lib/i18n';

const RANGES: StatsRange[] = ['4w', '6m', 'year', 'all'];
const RANGE_KEY: Record<StatsRange, string> = { '4w': 'stats.range4w', '6m': 'stats.range6m', year: 'stats.rangeYear', all: 'stats.rangeAll' };

function weekLabelText(weekLabel: string, language: Language): string {
  return new Date(weekLabel).toLocaleDateString(toLocale(language), { day: '2-digit', month: 'short' });
}

// Real GitHub-style year grid of listening intensity — free for everyone
// now (premium removed). Deferred: the redesign's own fit-algorithm
// listening calendar (spec 7.5, Appendix B) with week/month/season views;
// this keeps the existing simple year grid for now, just unlocked and
// restyled onto the new tokens.
function CalendarHeatmap() {
  const { t, language } = useApp();
  const [days, setDays] = useState<{ day: string; minutes: number }[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/stats/calendar').then((r) => (r.ok ? r.json() : null)).then((d) => { if (!cancelled && d) setDays(d.days); });
    return () => { cancelled = true; };
  }, []);

  const byDay = new Map((days || []).map((d) => [d.day, d.minutes]));
  const maxMinutes = Math.max(1, ...(days || []).map((d) => d.minutes));
  const cells: { day: string; minutes: number }[] = [];
  const cursor = new Date();
  cursor.setFullYear(cursor.getFullYear() - 1);
  cursor.setDate(cursor.getDate() + 1);
  for (let i = 0; i < 371; i++) {
    const key = cursor.toISOString().slice(0, 10);
    cells.push({ day: key, minutes: byDay.get(key) || 0 });
    cursor.setDate(cursor.getDate() + 1);
  }

  function level(minutes: number) {
    if (!minutes) return 0;
    if (minutes < 60) return 1;
    if (minutes < 120) return 2;
    if (minutes < 240) return 3;
    return 4;
  }

  return (
    <div className="tile s3">
      <h3>{t('stats.calendarTitle')}</h3>
      <p className="muted">{t('stats.calendarCaption')}</p>
      <div style={{ overflowX: 'auto', marginTop: 10 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(53,10px)', gridAutoRows: '10px', gap: 3, width: 'max-content' }}>
          {cells.map((c) => {
            const dateLabel = new Date(c.day).toLocaleDateString(toLocale(language), { day: '2-digit', month: 'short', year: 'numeric' });
            return <div key={c.day} className={`cd l${level(c.minutes)}`} style={{ width: 10, height: 10 }} title={`${dateLabel}: ${c.minutes} ${t('recap.minutes')}`} />;
          })}
        </div>
      </div>
      <div className="callegend" style={{ marginTop: 8 }}>
        <span>{t('stats.calendarLess')}</span>
        {[0, 1, 2, 3, 4].map((l) => <div key={l}><i className={`cd l${l}`} /></div>)}
        <span>{t('stats.calendarMore')}</span>
      </div>
    </div>
  );
}

export function StatsScreen(_props: { device: Device }) {
  const { t, language, me, lovedItems, toggleLoved, showScreen } = useApp();
  const [range, setRange] = useState<StatsRange>('6m');
  const [data, setData] = useState<StatsData | null>(null);

  useEffect(() => {
    if (!me) return;
    let cancelled = false;
    setData(null);
    fetch(`/api/stats?range=${range}`).then((r) => (r.ok ? r.json() : null)).then((d) => { if (!cancelled) setData(d); });
    return () => { cancelled = true; };
  }, [range, me]);

  if (!me) return null;

  const maxWeek = Math.max(1, ...(data?.hoursPerWeek.map((w) => w.hours) ?? [1]));
  const maxArtistHours = Math.max(1, ...(data?.topArtists.map((a) => a.hours) ?? [1]));
  const maxHeat = Math.max(1, ...(data?.heatmap ?? [1]));

  return (
    <>
      <div className="eyebrow">{t('stats.eyebrow')}</div>
      <h1 className="big">{t('stats.title')}</h1>
      <div className="chips">
        {RANGES.map((r) => (
          <button key={r} className={`chip ${range === r ? 'on' : ''}`} onClick={() => setRange(r)}>{t(RANGE_KEY[r] as never)}</button>
        ))}
      </div>

      {!data ? (
        <p className="muted">{t('stats.loading')}</p>
      ) : data.trackCount === 0 ? (
        <div className="tile empty">
          <p>{t('stats.empty')}</p>
          <button className="btn" onClick={() => showScreen('settings')}>{t('stats.emptyCta')}</button>
        </div>
      ) : (
        <>
          <div className="stats3" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(90px,1fr))' }}>
            <div className="tile"><span className="num">{data.hours}</span><small className="muted">{t('stats.hours')}</small></div>
            <div className="tile"><span className="num">{data.trackCount.toLocaleString(toLocale(language))}</span><small className="muted">{t('stats.tracks')}</small></div>
            <div className="tile"><span className="num">{data.artistCount}</span><small className="muted">{t('stats.artists')}</small></div>
            <div className="tile"><span className="num">{data.avgRating || '—'}</span><small className="muted">{t('history.avg')}</small></div>
            <div className="tile t-ac"><span className="num">{data.peakHour != null ? `${String(data.peakHour).padStart(2, '0')}:00` : '—'}</span><small>{t('stats.peakHour')}</small></div>
          </div>

          <div className="bento b3">
            <div className="tile s2">
              <h3>{t('stats.hoursPerWeek')}</h3>
              {data.hoursPerWeek.length >= 2 ? (
                <>
                  <div className="bars" style={{ marginTop: 10 }}>
                    {data.hoursPerWeek.map((w, i) => (
                      <i key={i} style={{ height: w.hours ? `${Math.max(6, (w.hours / maxWeek) * 100)}%` : '2%' }} title={`${weekLabelText(w.weekLabel, language)}: ${w.hours}h`} />
                    ))}
                  </div>
                  <div className="axis">
                    {data.hoursPerWeek.map((w, i) => {
                      const step = data.hoursPerWeek.length > 8 ? 3 : 1;
                      return <span key={i}>{i % step === 0 || i === data.hoursPerWeek.length - 1 ? weekLabelText(w.weekLabel, language) : ''}</span>;
                    })}
                  </div>
                </>
              ) : data.hoursPerWeek.length === 1 ? (
                <p className="muted">{t('stats.hoursPerWeekSingle', { label: weekLabelText(data.hoursPerWeek[0].weekLabel, language), hours: data.hoursPerWeek[0].hours })}</p>
              ) : <p className="muted">{t('stats.notEnough')}</p>}
            </div>

            <div className="tile">
              <h3>{t('stats.whenYouListen')}</h3>
              <div className="tod" style={{ marginTop: 10 }}>
                {data.heatmap.map((n, h) => <i key={h} className={n === maxHeat && n > 0 ? 'pk' : ''} style={{ height: `${Math.max(4, (n / maxHeat) * 100)}%` }} title={`${h}:00 — ${n}`} />)}
              </div>
              <div className="todax"><span>00</span><span>08</span><span>16</span><span>23</span></div>
            </div>

            <div className="tile">
              <h3>{t('stats.topArtists')}</h3>
              <div className="stack" style={{ marginTop: 10 }}>
                {data.topArtists.length ? data.topArtists.map((a, i) => (
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

            <CalendarHeatmap />

            {data.genreSplit.length > 0 && (
              <div className="tile s2">
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
              <div className="stack" style={{ marginTop: 10 }}>
                {data.recentPlays.map((p, i) => {
                  const loved = lovedItems.some((li) => li.type === 'track' && li.title === p.title && li.artist === p.artist);
                  return (
                    <div className="row" key={i}>
                      <CoverArt url={p.cover ?? undefined} fallbackLetter={p.artist[0] || '?'} className="cov" style={{ width: 36, height: 36 }} />
                      <div className="g"><b>{p.title}</b><div className="muted">{p.artist} · {new Date(p.playedAt).toLocaleString(toLocale(language), { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</div></div>
                      <button className={`ib love${loved ? ' on' : ''}`} onClick={() => toggleLoved('track', p.title, p.artist, p.trackId, p.cover)} aria-label={t('stats.loveTrack')}>
                        <HeartIcon filled={loved} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
