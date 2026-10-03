'use client';

import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { useApp } from '@/lib/AppContext';
import type { ApiUser, Device, DiscoverMatchPerson, GroupSummary, PublicProfile, StatsData } from '@/lib/types';
import { userAvatarStyle } from '@/lib/format';
import { computeMatch } from '@/lib/matchScore';
import { toLocale } from '@/lib/i18n';
import { CoverArt } from '../ui/CoverArt';
import { MascotIcon } from '../redesign/icons';
import { BlendButton } from '../BlendButton';

type FriendInfo = { profile: PublicProfile | null; score: number | null; stats6m: StatsData | null; weekHours: number | null };

function sharedArtistNames(a: StatsData | null, b: StatsData | null): string[] {
  if (!a || !b) return [];
  const bNames = new Set(b.topArtists.map((x) => x.name));
  return a.topArtists.filter((x) => bNames.has(x.name)).map((x) => x.name);
}

// countUp() in reference/app.js: the hero percentage counts up to its value
// over 450ms (ease-out cubic), replayed whenever the value changes or the
// screen is entered again. Skipped for reduced motion — the OS setting or
// the account's Motion switch, both folded into <html data-motion="off">.
function useCountUp(target: number | null, replayKey: unknown): number | null {
  const [shown, setShown] = useState(target);
  // Layout effect so the reset to 0 lands before paint — otherwise the final
  // number flashes for a frame before the count starts.
  useLayoutEffect(() => {
    if (target == null || document.documentElement.dataset.motion === 'off') { setShown(target); return; }
    setShown(0);
    let raf = 0;
    const t0 = performance.now();
    const step = (now: number) => {
      // rAF timestamps can predate performance.now() taken above.
      const k = Math.min(1, Math.max(0, (now - t0) / 450));
      setShown(Math.round(target * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, replayKey]);
  return shown;
}

// vMatch() in reference/app.js: a friend picker (pills) drives one
// continuous "You and {friend}" comparison — hero taste-match card with a
// dot-meter, a disagreement/gap list, shared artists, a weekly leaderboard,
// the full friends-by-match ranking, and a discover-more-people list. All
// numbers here are real (computeMatch, shared ratings, /api/stats), unlike
// the prototype's own hardcoded demo data.
export function MatchScreen(_props: { device: Device }) {
  const { t, language, me, state, myRatings, albums, liveAlbums, spotifyCovers, openAlbum, viewFriend, viewGroup, showScreen, addFriend } = useApp();
  const [info, setInfo] = useState<Record<string, FriendInfo>>({});
  const [groups, setGroups] = useState<GroupSummary[] | null>(null);
  const [discover, setDiscover] = useState<DiscoverMatchPerson[] | null>(null);
  const [myStats6m, setMyStats6m] = useState<StatsData | null>(null);
  const [myWeekHours, setMyWeekHours] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [history, setHistory] = useState<{ pct: number; date: string }[] | null>(null);

  useEffect(() => {
    if (!me) return;
    let cancelled = false;
    fetch('/api/stats?range=6m').then((r) => (r.ok ? r.json() : null)).then((d) => { if (!cancelled) setMyStats6m(d); });
    fetch('/api/stats?period=week').then((r) => (r.ok ? r.json() : null)).then((d) => { if (!cancelled) setMyWeekHours(d ? d.hours : null); });
    return () => { cancelled = true; };
  }, [me]);

  useEffect(() => {
    if (!me || !me.friends.length) { setInfo({}); return; }
    let cancelled = false;
    Promise.all(
      me.friends.map(async (f) => {
        const [profileRes, stats6mRes, weekRes] = await Promise.all([
          fetch(`/api/users/${f.id}`),
          fetch(`/api/stats?range=6m&userId=${f.id}`),
          fetch(`/api/stats?period=week&userId=${f.id}`),
        ]);
        const profile: PublicProfile | null = profileRes.ok ? await profileRes.json() : null;
        const stats6m: StatsData | null = stats6mRes.ok ? await stats6mRes.json() : null;
        const week: StatsData | null = weekRes.ok ? await weekRes.json() : null;
        const score = profile ? computeMatch(me.genres, profile.genres) : null;
        return [f.id, { profile, score, stats6m, weekHours: week ? week.hours : null }] as const;
      })
    ).then((pairs) => { if (!cancelled) setInfo(Object.fromEntries(pairs)); });
    return () => { cancelled = true; };
  }, [me]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/groups').then((r) => (r.ok ? r.json() : [])).then((d) => { if (!cancelled) setGroups(d); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!me) return;
    let cancelled = false;
    fetch('/api/match/discover').then((r) => (r.ok ? r.json() : { people: [] })).then((d) => { if (!cancelled) setDiscover(d.people); });
    return () => { cancelled = true; };
  }, [me]);

  const isActiveScreen = state.activeScreen === 'match';

  const ranked = useMemo(() => {
    if (!me) return [] as ApiUser[];
    return [...me.friends].sort((a, b) => (info[b.id]?.score ?? -1) - (info[a.id]?.score ?? -1));
  }, [me, info]);

  const activeId = (selectedId && ranked.some((f) => f.id === selectedId)) ? selectedId : (ranked[0]?.id ?? null);
  const active = activeId ? ranked.find((f) => f.id === activeId) ?? null : null;
  const activeInfo = activeId ? info[activeId] ?? null : null;
  // All screens stay mounted, so key the replay on the screen becoming
  // visible too — otherwise it would only ever animate off-screen at load.
  const shownPct = useCountUp(activeInfo?.score ?? null, isActiveScreen ? activeId : null);

  useEffect(() => {
    if (!activeId) { setHistory(null); return; }
    let cancelled = false;
    fetch(`/api/match/${activeId}/history`).then((r) => (r.ok ? r.json() : { history: [] })).then((d) => { if (!cancelled) setHistory(d.history); });
    return () => { cancelled = true; };
  }, [activeId]);

  if (!me) return null;

  if (!me.friends.length) {
    return (
      <>
        <div className="eyebrow muted">{t('match.eyebrow')}</div>
        <h1 className="big">{t('match.title')}</h1>
        <div className="tile t-soft2 empty">
          <MascotIcon />
          <h3>{t('friends.empty')}</h3>
          <p className="muted">{t('match.addFriendHint')}</p>
          <button className="btn" onClick={() => showScreen('profile')}>{t('friends.addFriendsTile')}</button>
        </div>
      </>
    );
  }

  const pct = activeInfo?.score ?? null;
  const filled = pct != null ? Math.round(pct / 5) : 0;
  const sharedArt = sharedArtistNames(myStats6m, activeInfo?.stats6m ?? null);

  const myScoreByAlbum = new Map(myRatings.map((r) => [r.albumId, r.stars] as const));
  const gaps = (activeInfo?.profile?.recentRatings ?? [])
    .filter((r) => myScoreByAlbum.has(r.albumId))
    .map((r) => ({ albumId: r.albumId, mine: myScoreByAlbum.get(r.albumId)!, theirs: r.stars }))
    .sort((a, b) => Math.abs(b.mine - b.theirs) - Math.abs(a.mine - a.theirs));

  const trendDelta = history && history.length >= 2 ? Math.round(history[history.length - 1].pct - history[0].pct) : null;
  // A bare month name is nominative in Russian ("с сентябрь"); day + month
  // gives the genitive the sentence needs ("с 5 сентября").
  const trendDate = history && history.length >= 2
    ? new Date(history[0].date).toLocaleDateString(toLocale(language), language === 'ru' ? { day: 'numeric', month: 'long' } : { month: 'long' })
    : '';

  const leaderboard = [
    { id: 'me', name: t('friend.you'), hours: myWeekHours ?? 0 },
    ...ranked.map((f) => ({ id: f.id, name: f.name, hours: info[f.id]?.weekHours ?? 0 })),
  ].sort((a, b) => b.hours - a.hours);
  const maxHours = Math.max(1, ...leaderboard.map((l) => l.hours));

  return (
    <>
      <div className="eyebrow muted">{t('match.eyebrow')}</div>
      <h1 className="big">{t('match.youAndName', { name: active?.name ?? '' })}</h1>
      <div className="chips">
        {ranked.map((f) => (
          <button key={f.id} className={`chip${f.id === activeId ? ' on' : ''}`} onClick={() => setSelectedId(f.id)}>
            <span className="dot" style={{ ...userAvatarStyle(f), width: 20, height: 20, fontSize: 11, marginRight: 6, display: 'inline-flex' }}>{f.name[0]}</span>
            {f.name}
          </button>
        ))}
      </div>

      <div className="tile t-ink glow" style={{ padding: 28 }}>
        {trendDelta != null && trendDelta !== 0 && (
          <span className="pill" style={{ marginBottom: 12 }}>
            {t(trendDelta > 0 ? 'match.pctUpSince' : 'match.pctDownSince', { delta: Math.abs(trendDelta), date: trendDate })}
          </span>
        )}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6 }}>
          <span className="num pct">{shownPct ?? '—'}</span><span className="num pcts">%</span>
        </div>
        <p style={{ fontWeight: 800, marginTop: 16 }}>{t('match.tasteMatchSummary', { count: sharedArt.length })}</p>
        <div className="dotm" role="img" aria-label={t('match.percentMatchAria', { pct: pct ?? 0 })}>
          {Array.from({ length: 20 }, (_, i) => <i key={i} className={i < filled ? 'f' : ''} />)}
        </div>
        <div className="acts">
          <button className="btn" onClick={() => active && viewFriend(active.id)}>{t('match.viewProfile', { name: active?.name ?? '' })}</button>
        </div>
      </div>

      <div className="sec two">
        <div>
          <h2>{t('match.whereYouDisagree')}</h2>
          <div className="tile t-soft2">
            {gaps.length ? gaps.map((g) => {
              const a = liveAlbums[g.albumId] || albums.find((x) => x.id === g.albumId);
              const lo = Math.min(g.mine, g.theirs), hi = Math.max(g.mine, g.theirs);
              return (
                <div className="gap" key={g.albumId}>
                  <button className="hd" onClick={() => openAlbum(g.albumId)}>
                    {a && <CoverArt url={spotifyCovers[a.id] || a.cover} fallbackLetter={a.artist[0] || '?'} className="cov" style={{ width: 54, height: 54 }} />}
                    <div><b>{a?.title ?? g.albumId}</b><br /><small className="muted">{t('match.apart', { value: (hi - lo).toFixed(1) })}</small></div>
                  </button>
                  <div className="tr">
                    <i className="fill" style={{ left: `${(lo / 5) * 100}%`, width: `${((hi - lo) / 5) * 100}%` }} />
                    <b className="m you" style={{ left: `${(g.mine / 5) * 100}%` }}>{t('friend.you')[0]}</b>
                    <b className="m fr" style={{ left: `${(g.theirs / 5) * 100}%` }}>{(active?.name ?? '?')[0]}</b>
                  </div>
                  <div className="lab">
                    <span>{t('friend.you')} {g.mine.toFixed(1)}</span>
                    <span>{active?.name} {g.theirs.toFixed(1)}</span>
                  </div>
                </div>
              );
            }) : <p className="muted">{t('match.notEnoughForGaps')}</p>}
          </div>
        </div>
        <div className="stack">
          <div className="tile">
            <h2>{t('match.sharedArtistsTitle')}</h2>
            {sharedArt.length ? (
              <div className="chips" style={{ margin: 0 }}>
                {sharedArt.map((n) => <span className="chip" key={n}>{n}</span>)}
              </div>
            ) : <p className="muted">{t('match.noSharedArtists')}</p>}
          </div>
          {active && (
            <div className="tile t-ac" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <h2 style={{ marginBottom: 4 }}>{t('match.yourBlend')}</h2>
                <p style={{ fontWeight: 700 }}>{t('match.yourBlendSubtitle', { name: active.name })}</p>
              </div>
              <BlendButton me={me.id} friend={active.id} friendName={active.name.split(' ')[0]} matchPct={pct} />
            </div>
          )}
          <div className="tile">
            <h2>{t('match.weeklyLeaderboard')}</h2>
            <div className="stack" style={{ marginTop: 10 }}>
              {leaderboard.map((l, i) => (
                <div className="row" key={l.id}>
                  <span className="num" style={{ fontSize: 28, width: 20 }}>{i + 1}</span>
                  <b style={{ width: 64 }}>{l.name}</b>
                  <div className="meter"><i style={{ width: `${(l.hours / maxHours) * 100}%` }} /></div>
                  <b style={{ width: 44, textAlign: 'right' }}>{l.hours}h</b>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="sec two">
        <div>
          <h2>{t('match.yourFriendsByMatch')}</h2>
          <div className="tile">
            {ranked.map((f, i) => (
              <button className="row" key={f.id} onClick={() => viewFriend(f.id)} style={{ cursor: 'pointer' }}>
                <span className="num" style={{ fontSize: 26, width: 22 }}>{i + 1}</span>
                <div className="dot" style={userAvatarStyle(f)}>{f.name[0]}</div>
                <div className="g"><b>{f.name}</b><small className="muted">{t('match.sharedArtistsCount', { count: sharedArtistNames(myStats6m, info[f.id]?.stats6m ?? null).length })}</small></div>
                <span className="num" style={{ fontSize: 32, color: 'var(--acct)' }}>{info[f.id]?.score ?? '—'}%</span>
              </button>
            ))}
          </div>
        </div>
        <div>
          <h2>{t('match.discoverTitle')}</h2>
          <div className="tile t-soft2">
            {discover !== null && discover.length ? discover.map((p) => (
              <div className="row" key={p.id}>
                <button className="rowlink" onClick={() => viewFriend(p.id)}>
                  <div className="dot" style={userAvatarStyle(p)}>{p.name[0]}</div>
                  <div className="g"><b>{p.name}</b><small className="muted">@{p.handle} · {t('match.discoverRowSubtitle', { score: p.score, count: p.sharedAlbums })}</small></div>
                </button>
                <button className="chip" onClick={() => addFriend(p.handle)}>{t('friend.addThem')}</button>
              </div>
            )) : <p className="muted">{t('match.allFriendsMatched')}</p>}
          </div>
        </div>
      </div>

      <div className="sec">
        <div className="setrow" style={{ border: 0, padding: 0 }}>
          <h2 style={{ marginBottom: 0 }}>{t('groups.yourGroups')}</h2>
          <button className="btn ghost" onClick={() => showScreen('groups')}>{t('groups.openAll')}</button>
        </div>
        {groups === null ? (
          <p className="muted">{t('groups.loading')}</p>
        ) : !groups.length ? (
          <div className="tile empty"><p>{t('groups.noneYet')}</p></div>
        ) : (
          <div className="bento b3">
            {groups.slice(0, 3).map((g) => (
              <button className="tile gl" key={g.id} onClick={() => viewGroup(g.id)} style={{ textAlign: 'left', cursor: 'pointer' }}>
                <h3>{g.name}</h3>
                <div className="hrow" style={{ margin: '12px 0 8px', gap: 6, flexWrap: 'wrap' }}>
                  {g.members.map((m) => (
                    <span key={m.id} className="dot" style={{ ...userAvatarStyle(m), width: 28, height: 28, fontSize: 12 }}>{m.name[0]}</span>
                  ))}
                </div>
                <small className="muted">{t('groups.memberCount', { count: g.memberCount })}{g.newPlays > 0 ? ` · ${t('groups.newPlaysTag', { count: g.newPlays })}` : ''}</small>
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
