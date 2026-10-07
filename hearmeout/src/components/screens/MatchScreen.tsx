'use client';

import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { fmt1 } from '@/lib/numberFormat';
import { useApp } from '@/lib/AppContext';
import type { ApiUser, Device, DiscoverMatchPerson, GroupSummary, PublicProfile, StatsData } from '@/lib/types';
import { userAvatarStyle } from '@/lib/format';
import { computeMatch } from '@/lib/matchScore';
import { cachedJson } from '@/lib/cachedJson';
import { toLocale, pluralForKey } from '@/lib/i18n';
import { CoverArt } from '../ui/CoverArt';
import { MascotIcon } from '../redesign/icons';
import { BlendButton } from '../BlendButton';
import { MATCH_FRIEND_EVENT } from '@/lib/uiEvents';
import { PROFILE_TAB_EVENT } from '../redesign/AvatarMenu';

type RawInfo = { profile: PublicProfile | null; stats6m: StatsData | null; weekHours: number | null };
type FriendInfo = RawInfo & { score: number | null };
const EMPTY_INFO: RawInfo = { profile: null, stats6m: null, weekHours: null };

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
  const { t, language, me, state, myRatings, albums, liveAlbums, spotifyCovers, openAlbum, viewFriend, viewGroup, showScreen, addFriend, friendRequests } = useApp();
  const [rawInfo, setRawInfo] = useState<Record<string, RawInfo>>({});
  const [groups, setGroups] = useState<GroupSummary[] | null>(null);
  const [discover, setDiscover] = useState<DiscoverMatchPerson[] | null>(null);
  const [myStats6m, setMyStats6m] = useState<StatsData | null>(null);
  const [myWeekHours, setMyWeekHours] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // "Compare with …" / Taste match rows elsewhere pick the friend here.
  useEffect(() => {
    const onPick = (e: Event) => setSelectedId((e as CustomEvent<string>).detail);
    window.addEventListener(MATCH_FRIEND_EVENT, onPick);
    return () => window.removeEventListener(MATCH_FRIEND_EVENT, onPick);
  }, []);
  const [history, setHistory] = useState<{ pct: number; date: string }[] | null>(null);

  useEffect(() => {
    if (!me) return;
    let cancelled = false;
    cachedJson<StatsData>('/api/stats?range=6m').then((d) => { if (!cancelled) setMyStats6m(d); });
    fetch('/api/stats?period=week').then((r) => (r.ok ? r.json() : null)).then((d) => { if (!cancelled) setMyWeekHours(d ? d.hours : null); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id]);

  // Each friend loads on its own and shows as soon as it arrives: waiting
  // for every friend's three requests at once (one failure dropped them
  // all) left the whole screen at "–" on a slow server. Reloads only when
  // the friend list changes, not on every refresh of `me` (the friend
  // request check refreshes it every minute and used to restart the load).
  const friendIdsKey = me ? me.friends.map((f) => f.id).join(',') : '';
  useEffect(() => {
    const ids = friendIdsKey ? friendIdsKey.split(',') : [];
    setRawInfo({});
    if (!ids.length) return;
    let cancelled = false;
    const patch = (id: string, part: Partial<RawInfo>) => { if (!cancelled) setRawInfo((prev) => ({ ...prev, [id]: { ...EMPTY_INFO, ...prev[id], ...part } })); };
    for (const id of ids) {
      cachedJson<PublicProfile>(`/api/users/${id}`).then((profile) => patch(id, { profile }));
      cachedJson<StatsData>(`/api/stats?range=6m&userId=${id}`).then((stats6m) => patch(id, { stats6m }));
      cachedJson<StatsData>(`/api/stats?period=week&userId=${id}`).then((week) => patch(id, { weekHours: week ? week.hours : null }));
    }
    return () => { cancelled = true; };
  }, [friendIdsKey]);
  // The % follows your current genres without refetching anyone.
  const myGenres = me?.genres;
  const info = useMemo(() => {
    const out: Record<string, FriendInfo> = {};
    for (const [id, raw] of Object.entries(rawInfo)) out[id] = { ...raw, score: raw.profile && myGenres ? computeMatch(myGenres, raw.profile.genres) : null };
    return out;
  }, [rawInfo, myGenres]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id]);

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
        <p className="eyebrow muted">{t('match.eyebrow')}</p>
        <h1 className="big">{t('match.title')}</h1>
        <div className="tile t-soft2 empty">
          <MascotIcon />
          <h3>{t('friends.empty')}</h3>
          <p className="muted" style={{ fontWeight: 600 }}>{t('match.addFriendHint')}</p>
          <button className="btn" onClick={() => { showScreen('profile'); window.dispatchEvent(new CustomEvent(PROFILE_TAB_EVENT, { detail: 'friends' })); }}>{t('friends.addFriendsTile')}</button>
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
      <p className="eyebrow muted">{t('match.eyebrow')}</p>
      <h1 className="big">{t('match.youAndName', { name: active?.name ?? '' })}</h1>
      <div className="chips">
        {ranked.map((f) => (
          <button key={f.id} className={`chip${f.id === activeId ? ' on' : ''}`} onClick={() => setSelectedId(f.id)}>
            <span className="dot" style={userAvatarStyle(f)}>{!f.avatarUrl && f.name[0]}</span>
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
          <span className="num pct">{shownPct ?? '–'}</span>{shownPct != null && <span className="num pcts">%</span>}
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
                    <div><b>{a?.title ?? g.albumId}</b><br /><small className="muted" style={{ fontWeight: 700 }}>{t('match.apart', { value: fmt1((hi - lo)) })}</small></div>
                  </button>
                  <div className="tr">
                    <i className="fill" style={{ left: `${(lo / 5) * 100}%`, width: `${((hi - lo) / 5) * 100}%` }} />
                    <b className="m you" style={{ left: `${(g.mine / 5) * 100}%` }}>{t('friend.youLower')[0]}</b>
                    <b className="m fr" style={{ left: `${(g.theirs / 5) * 100}%` }}>{(active?.name ?? '?')[0]}</b>
                  </div>
                  <div className="lab">
                    {g.mine <= g.theirs
                      ? <><span>{t('friend.youLower')} {fmt1(g.mine)}</span><span>{active?.name} {fmt1(g.theirs)}</span></>
                      : <><span>{active?.name} {fmt1(g.theirs)}</span><span>{t('friend.youLower')} {fmt1(g.mine)}</span></>}
                  </div>
                </div>
              );
            }) : <p className="muted" style={{ fontWeight: 600 }}>{t('match.notEnoughForGaps')}</p>}
          </div>
        </div>
        <div className="stack">
          <div className="tile">
            <h2>{t('match.sharedArtistsTitle')}</h2>
            {sharedArt.length ? (
              <div className="chips" style={{ margin: 0 }}>
                {sharedArt.map((n) => <span className="chip" key={n}>{n}</span>)}
              </div>
            ) : <p className="muted" style={{ fontWeight: 600 }}>{t('match.noSharedArtists')}</p>}
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
            <>
              {leaderboard.map((l, i) => (
                <div className="row" key={l.id}>
                  <span className="num" style={{ fontSize: 28, width: 20 }}>{i + 1}</span>
                  <b style={{ width: 64 }}>{l.name}</b>
                  <div className="meter"><i style={{ width: `${(l.hours / maxHours) * 100}%` }} /></div>
                  <b style={{ width: 44, textAlign: 'right' }}>{l.hours}{t('unit.h')}</b>
                </div>
              ))}
            </>
          </div>
        </div>
      </div>

      <div className="sec two">
        <div>
          <h2>{t('match.yourFriendsByMatch')}</h2>
          <div className="tile">
            {ranked.map((f, i) => (
              <button className="row" key={f.id} onClick={() => { setSelectedId(f.id); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
                <span className="num" style={{ fontSize: 26, width: 22 }}>{i + 1}</span>
                <span className="dot" style={userAvatarStyle(f)}>{!f.avatarUrl && f.name[0]}</span>
                <span className="g"><b>{f.name}</b><small className="muted" style={{ fontWeight: 600 }}>{t('match.sharedArtistsCount', { count: sharedArtistNames(myStats6m, info[f.id]?.stats6m ?? null).length })}</small></span>
                <span className="num" style={{ fontSize: 32, color: 'var(--acct)' }}>{info[f.id]?.score != null ? `${info[f.id]!.score}%` : '–'}</span>
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
                  <span className="dot" style={userAvatarStyle(p)}>{!p.avatarUrl && p.name[0]}</span>
                  <span className="g"><b>{p.name}</b><small className="muted" style={{ fontWeight: 600 }}>@{p.handle.replace(/^@/, '')} · {t('match.discoverRowSubtitle', { score: p.score, count: p.sharedAlbums })}</small></span>
                </button>
                {friendRequests.outgoing.some((r) => r.user.id === p.id)
                  ? <span className="tag">{t('friend.requestSent')}</span>
                  : <button className="btn" style={{ padding: '8px 16px' }} onClick={() => addFriend(p.handle)}>{t('friend.addFriend')}</button>}
              </div>
            )) : <p className="muted" style={{ fontWeight: 600 }}>{t('match.allFriendsMatched')}</p>}
          </div>
        </div>
      </div>

      <div className="sec">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>{t('groups.yourGroups')}</h2>
          <button className="btn ghost" onClick={() => showScreen('groups')}>{t('groups.openAll')}</button>
        </div>
        {groups === null ? (
          <p className="muted">{t('groups.loading')}</p>
        ) : !groups.length ? (
          <div className="tile empty"><p>{t('groups.noneYet')}</p></div>
        ) : (
          <div className="bento b3">
            {groups.slice(0, 3).map((g) => (
              <button className="tile gl" key={g.id} onClick={() => viewGroup(g.id)} style={{ textAlign: 'left' }}>
                <h3>{g.name}</h3>
                <div style={{ display: 'flex', gap: 6, margin: '12px 0 8px', flexWrap: 'wrap' }}>
                  {g.members.map((m) => (
                    <span key={m.id} className="dot" style={userAvatarStyle(m)}>{!m.avatarUrl && m.name[0]}</span>
                  ))}
                </div>
                <small className="muted" style={{ fontWeight: 700 }}>{t('groups.memberCount', { count: g.memberCount, word: pluralForKey(language, g.memberCount, 'groups.memberOne', 'groups.memberFew', 'groups.memberMany') })}{g.newPlays > 0 ? ` · ${t('groups.newPlaysTag', { count: g.newPlays })}` : ''}</small>
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
