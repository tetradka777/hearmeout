'use client';

import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { toneColor, usePersonColor } from '../ui/Visual';
import { SharedArtistsCard } from '../SharedArtistsCard';
import { fmt1, fmtHours } from '@/lib/numberFormat';
import { useApp } from '@/lib/AppContext';
import type { ApiUser, Device, DiscoverMatchPerson, PublicProfile, StatsData } from '@/lib/types';
import { userAvatarStyle } from '@/lib/format';
import { blurStyle } from '@/lib/imageColor';
import { sizedImage } from '@/lib/imageSize';
import { computeMatch } from '@/lib/matchScore';
import { cachedJson, peekJson, useCachedJson } from '@/lib/cachedJson';
import { sharedArtists } from '@/lib/sharedArtists';
import { toLocale } from '@/lib/i18n';
import { CoverArt } from '../ui/CoverArt';
import { MascotIcon } from '../redesign/icons';
import { Podium } from '../ui/Podium';
import { MATCH_FRIEND_EVENT, takeRecentEvent } from '@/lib/uiEvents';
import { CoverWall, PersonCards } from '../ui/Visual';
import { PROFILE_TAB_EVENT } from '@/lib/uiEvents';

type RawInfo = { profile: PublicProfile | null; stats6m: StatsData | null; weekHours: number | null };
type FriendInfo = RawInfo & { score: number | null };
const EMPTY_INFO: RawInfo = { profile: null, stats6m: null, weekHours: null };

const sharedArtistNames = sharedArtists;
const SHARED_SHOWN = 6;

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
// dot-meter, a disagreement/gap list, shared artists, a weekly leaderboard
// (top three) and a discover-more-people list. All
// numbers here are real (computeMatch, shared ratings, /api/stats), unlike
// the prototype's own hardcoded demo data.
type Who = { id: string; name: string; avatarUrl: string | null };

// The big match card: you and your friend blurred behind it, from your
// colour on the left to theirs on the right.
function MatchHero({ me, friend, children }: { me: Who | null; friend: Who | null; children: ReactNode }) {
  const mine = usePersonColor(me ?? { id: 'me', name: '?', avatarUrl: null });
  const theirs = usePersonColor(friend ?? { id: 'friend', name: '?', avatarUrl: null });
  // Two people with the same tone would make no gradient: the friend's side shifts.
  const right = theirs === mine ? toneColor(`${friend?.id ?? 'friend'}~`) : theirs;
  const style = {
    ['--g1' as string]: mine, ['--g2' as string]: right,
    ['--a1' as string]: me?.avatarUrl ? `url('${me.avatarUrl}')` : 'none',
    ['--a2' as string]: friend?.avatarUrl ? `url('${friend.avatarUrl}')` : 'none',
  } as CSSProperties;
  return <div className="tile mh16" style={style}>{children}</div>;
}

// The weekly leaderboard over the colours of its top three: each one's
// glow behind their place on the podium (second left, first middle, third
// right).
function LeaderboardTile({ people, children }: { people: (ApiUser | null)[]; children: ReactNode }) {
  const c1 = usePersonColor(people[0] ?? { id: 'lb1', name: '1', avatarUrl: null });
  const c2 = usePersonColor(people[1] ?? { id: 'lb2', name: '2', avatarUrl: null });
  const c3 = usePersonColor(people[2] ?? { id: 'lb3', name: '3', avatarUrl: null });
  const style = { ['--l1' as string]: c1, ['--l2' as string]: people[1] ? c2 : c1, ['--l3' as string]: people[2] ? c3 : people[1] ? c2 : c1 } as CSSProperties;
  return <div className="tile lb10 lb19" style={style}>{children}</div>;
}

export function MatchScreen(_props: { device: Device }) {
  const { t, language, me, state, myRatings, albums, liveAlbums, spotifyCovers, openAlbum, viewFriend, showScreen, addFriend, friendRequests } = useApp();
  const [rawInfo, setRawInfo] = useState<Record<string, RawInfo>>({});
  // All from the shared cache (lib/cachedJson): shown at once, refreshed.
  const discover = useCachedJson<{ people: DiscoverMatchPerson[] }>(me ? '/api/match/discover' : null).data?.people ?? null;
  const myStats6m = useCachedJson<StatsData>(me ? '/api/stats?range=6m' : null).data;
  const myWeek = useCachedJson<StatsData>(me ? '/api/stats?period=week' : null).data;
  const myWeekHours = myWeek ? myWeek.hours : null;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // "Compare with …" / Taste match rows elsewhere pick the friend here.
  useEffect(() => {
    const onPick = (e: Event) => setSelectedId((e as CustomEvent<string>).detail);
    // A jump that opened this screen for the first time fired before it mounted.
    const pending = takeRecentEvent<string>(MATCH_FRIEND_EVENT);
    if (pending) setSelectedId(pending);
    window.addEventListener(MATCH_FRIEND_EVENT, onPick);
    return () => window.removeEventListener(MATCH_FRIEND_EVENT, onPick);
  }, []);

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
      patch(id, {
        profile: peekJson<PublicProfile>(`/api/users/${id}`),
        stats6m: peekJson<StatsData>(`/api/stats?range=6m&userId=${id}`),
        weekHours: peekJson<StatsData>(`/api/stats?period=week&userId=${id}`)?.hours ?? null,
      });
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

  const history = useCachedJson<{ history: { pct: number; date: string }[] }>(activeId ? `/api/match/${activeId}/history` : null).data?.history ?? null;

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

  const sharedArt = sharedArtistNames(myStats6m, activeInfo?.stats6m ?? null);

  const myScoreByAlbum = new Map(myRatings.map((r) => [r.albumId, r.stars] as const));
  const gaps = (activeInfo?.profile?.recentRatings ?? [])
    .filter((r) => myScoreByAlbum.has(r.albumId))
    .map((r) => ({ albumId: r.albumId, mine: myScoreByAlbum.get(r.albumId)!, theirs: r.stars }))
    .sort((a, b) => Math.abs(b.mine - b.theirs) - Math.abs(a.mine - a.theirs));
  const gapAlbum = gaps[0] ? liveAlbums[gaps[0].albumId] || albums.find((x) => x.id === gaps[0].albumId) : undefined;
  const gapCover = gapAlbum ? spotifyCovers[gapAlbum.id] || gapAlbum.cover || null : null;

  const trendDelta = history && history.length >= 2 ? Math.round(history[history.length - 1].pct - history[0].pct) : null;
  const trendDate = history && history.length >= 2
    ? new Date(history[0].date).toLocaleDateString(toLocale(language), { month: 'long' })
    : '';

  const leaderboard: { id: string; name: string; hours: number; user: ApiUser | null }[] = [
    { id: 'me', name: t('friend.you'), hours: myWeekHours ?? 0, user: me },
    ...ranked.map((f) => ({ id: f.id, name: f.name, hours: info[f.id]?.weekHours ?? 0, user: f })),
  ].sort((a, b) => b.hours - a.hours);
  // How far you are from first, and the minutes a day that would close it
  // by the end of the week (days left counted from today).
  const myRank = leaderboard.findIndex((l) => l.id === 'me');
  const leader = leaderboard[0];
  const daysLeft = (() => { const dow = new Date().getDay(); return me.weekStart === 'sun' ? 7 - dow : dow === 0 ? 1 : 8 - dow; })();
  const gapHint = myRank > 0 && leader.hours > 0
    ? t('match.gapHint', { h: fmtHours(Math.round((leader.hours - leaderboard[myRank].hours) * 10) / 10), name: leader.name, m: Math.max(1, Math.round(((leader.hours - leaderboard[myRank].hours) * 60) / daysLeft)) })
    : myRank === 0 && leaderboard.length > 1 && leader.hours > 0 ? t('match.leadHint', { h: fmtHours(Math.round((leader.hours - leaderboard[1].hours) * 10) / 10) }) : null;

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

      <MatchHero me={me} friend={active ?? null}>
        {trendDelta != null && trendDelta !== 0 && (
          <span className="pill" style={{ marginBottom: 12 }}>
            {t(trendDelta > 0 ? 'match.pctUpSince' : 'match.pctDownSince', { delta: Math.abs(trendDelta), date: trendDate })}
          </span>
        )}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6 }}>
          <span className="num pct">{shownPct ?? '–'}</span>{shownPct != null && <span className="num pcts">%</span>}
        </div>
        <p style={{ fontWeight: 800, marginTop: 16 }}>{t('match.tasteMatchSummary', { count: sharedArt.length })}</p>
        <div className="acts">
          <button className="btn" onClick={() => active && viewFriend(active.id)}>{t('match.viewProfile', { name: active?.name ?? '' })}</button>
        </div>
      </MatchHero>

      <div className="sec two">
        <div>
          {/* Over the blurred cover of the album you two are furthest apart on. */}
          <div className="tile bh15 dis19" style={blurStyle(gapCover ? sizedImage(gapCover, 300) ?? gapCover : null)}>
            <h2>{t('match.whereYouDisagree')}</h2>
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
          {/* The six most played shared artists. */}
          <SharedArtistsCard names={sharedArt} shown={SHARED_SHOWN} title={t('match.sharedArtistsTitle')} empty={t('match.noSharedArtists')} />
          {/* Weekly leaderboard (rev 11): the top three, and how far you are from first. */}
          <LeaderboardTile people={leaderboard.slice(0, 3).map((l) => l.user ?? (me ? { id: me.id, name: me.name, handle: me.handle, avatarUrl: me.avatarUrl } : null))}>
            <div className="hd10"><div><h2 style={{ margin: 0 }}>{t('match.weeklyLeaderboard')}</h2><small className="muted" style={{ fontWeight: 700 }}>{t('match.leaderboardSub')}</small></div></div>
            <Podium
              label={t('match.weeklyLeaderboard')}
              entries={leaderboard.map((l) => ({
                key: l.id,
                name: l.name,
                value: `${fmtHours(l.hours)}${t('unit.h')}`,
                you: l.id === 'me',
                avatar: { style: l.user ? { ...userAvatarStyle(l.user), backgroundSize: 'cover' } : undefined, letter: l.user ? !l.user.avatarUrl && l.user.name[0]?.toUpperCase() : t('friend.you')[0] },
                person: l.user ? { id: l.user.id, name: l.user.name, avatarUrl: l.user.avatarUrl } : me ? { id: me.id, name: me.name, avatarUrl: me.avatarUrl } : undefined,
                onClick: l.id === 'me' ? undefined : () => viewFriend(l.id),
              }))}
            />
            {myRank >= 3 && <p className="gap10"><i className="ic ic-medal" /><span>{t('match.yourPlace', { n: myRank + 1, h: fmtHours(leaderboard[myRank].hours) })}</span></p>}
            {gapHint && <p className="gap10"><i className="ic ic-trend" /><span>{gapHint}</span></p>}
          </LeaderboardTile>
        </div>
      </div>

      <div className="sec">
        <div className="tile t-soft2">
          <div className="hd10"><h2 style={{ margin: 0 }}>{t('match.discoverTitle')}</h2></div>
          {discover !== null && discover.length ? (
            <PersonCards people={discover.slice(0, 6).map((p) => ({
              id: p.id, name: p.name, avatarUrl: p.avatarUrl, value: `${p.score}%`, onClick: () => viewFriend(p.id),
              action: friendRequests.outgoing.some((r) => r.user.id === p.id)
                ? <span className="tag" style={{ alignSelf: 'center' }}>{t('friend.requestSent')}</span>
                : <button className="btn" onClick={() => addFriend(p.handle)}>{t('friend.addFriend')}</button>,
            }))} />
          ) : <p className="muted" style={{ fontWeight: 600 }}>{t('match.allFriendsMatched')}</p>}
        </div>
      </div>

      {/* Everything you both rated (rev 10/11): the biggest gaps first, five rows. */}
      {gaps.length > 0 && active && (
        <div className="sec">
          <div className="tile sh10">
            <div className="hd10"><h2 style={{ margin: 0 }}>{t('match.bothRatedTitle')}</h2></div>
            <CoverWall items={gaps.slice(0, 6).map((g) => {
              const a = liveAlbums[g.albumId] || albums.find((x) => x.id === g.albumId);
              const d = Math.abs(g.mine - g.theirs);
              return {
                key: g.albumId, cover: a ? spotifyCovers[a.id] || a.cover : undefined, title: a?.title ?? '…', artist: a?.artist, artistId: a?.artistId,
                badge: d <= 0.5 ? '=' : `±${fmt1(d)}`,
                sub: `${t('friend.you')} ${fmt1(g.mine)} · ${active.name} ${fmt1(g.theirs)}`,
                onClick: () => openAlbum(g.albumId),
              };
            })} />
          </div>
        </div>
      )}
    </>
  );
}
