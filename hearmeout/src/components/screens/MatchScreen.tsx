'use client';

import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { fmt1, fmtHours } from '@/lib/numberFormat';
import { useApp } from '@/lib/AppContext';
import type { ApiUser, Device, DiscoverMatchPerson, PublicProfile, StatsData } from '@/lib/types';
import { userAvatarStyle } from '@/lib/format';
import { blurStyle } from '@/lib/imageColor';
import { computeMatch } from '@/lib/matchScore';
import { cachedJson, peekJson, useCachedJson } from '@/lib/cachedJson';
import { sharedArtists } from '@/lib/sharedArtists';
import { toLocale } from '@/lib/i18n';
import { MascotIcon } from '../redesign/icons';
import { RankRows } from '../ui/RankRows';
import { MATCH_FRIEND_EVENT, takeRecentEvent } from '@/lib/uiEvents';
import { PersonCards } from '../ui/Visual';
import { AlbumShelfCard, ArtistShelfCard, Shelf } from '../ui/SuperCards';
import { useOpenArtist } from '../ui/ArtistName';
import { PROFILE_TAB_EVENT } from '@/lib/uiEvents';

type RawInfo = { profile: PublicProfile | null; stats6m: StatsData | null; weekHours: number | null };
type FriendInfo = RawInfo & { score: number | null };
const EMPTY_INFO: RawInfo = { profile: null, stats6m: null, weekHours: null };

const sharedArtistNames = sharedArtists;
const RING = 2 * Math.PI * 33;

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

// Taste match: your friends as ringed faces (the ring is the match) pick
// one comparison — the two of you over a picture with the % and its line
// over time, shelves of the albums you agree and disagree on, the artists
// you share as photo cards, the week's leaderboard over the leader's photo,
// and people you might match with. All numbers are real (computeMatch,
// shared ratings, /api/stats).

export function MatchScreen(_props: { device: Device }) {
  const { t, language, me, state, myRatings, albums, liveAlbums, spotifyCovers, openAlbum, viewFriend, showScreen, addFriend, friendRequests } = useApp();
  const [rawInfo, setRawInfo] = useState<Record<string, RawInfo>>({});
  // All from the shared cache (lib/cachedJson): shown at once, refreshed.
  const discover = useCachedJson<{ people: DiscoverMatchPerson[] }>(me ? '/api/match/discover' : null).data?.people ?? null;
  const myStats6m = useCachedJson<StatsData>(me ? '/api/stats?range=6m' : null).data;
  const myWeek = useCachedJson<StatsData>(me ? `/api/stats?period=week&weekStart=${me.weekStart}&offset=0` : null).data;
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

  const openArtist = useOpenArtist();
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
  // Their Spotify ids, where either of you has them (a photo and a page by
  // name alone can be a namesake's).
  const artistIdOf = new Map<string, string>();
  for (const x of [...(myStats6m?.topArtists ?? []), ...(activeInfo?.stats6m?.topArtists ?? [])]) {
    if (x.id && !artistIdOf.has(x.name.toLowerCase())) artistIdOf.set(x.name.toLowerCase(), x.id);
  }

  const myScoreByAlbum = new Map(myRatings.map((r) => [r.albumId, r.stars] as const));
  const gaps = (activeInfo?.profile?.recentRatings ?? [])
    .filter((r) => myScoreByAlbum.has(r.albumId))
    .map((r) => ({ albumId: r.albumId, mine: myScoreByAlbum.get(r.albumId)!, theirs: r.stars }))
    .sort((a, b) => Math.abs(b.mine - b.theirs) - Math.abs(a.mine - a.theirs));
  const gapAlbum = gaps[0] ? liveAlbums[gaps[0].albumId] || albums.find((x) => x.id === gaps[0].albumId) : undefined;
  const gapCover = gapAlbum ? spotifyCovers[gapAlbum.id] || gapAlbum.cover || null : null;

  // The hero's picture: the friend's photo, else the newest album you both rated.
  const bothNewest = (activeInfo?.profile?.recentRatings ?? []).find((r) => myScoreByAlbum.has(r.albumId));
  const bothAlbum = bothNewest ? liveAlbums[bothNewest.albumId] || albums.find((x) => x.id === bothNewest.albumId) : undefined;
  const heroPicture = active?.avatarUrl || (bothAlbum ? spotifyCovers[bothAlbum.id] || bothAlbum.cover || null : null) || gapCover;

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

  // The albums you both rated: closest scores first ("you agree on"), the
  // furthest apart first ("where you disagree").
  const agree = gaps.filter((g) => Math.abs(g.mine - g.theirs) <= 0.5).sort((a, b) => Math.abs(a.mine - a.theirs) - Math.abs(b.mine - b.theirs) || b.mine - a.mine);
  const disagree = gaps.filter((g) => Math.abs(g.mine - g.theirs) >= 1);
  const albumCard = (g: { albumId: string; mine: number; theirs: number }) => {
    const a = liveAlbums[g.albumId] || albums.find((x) => x.id === g.albumId);
    const d = Math.abs(g.mine - g.theirs);
    return (
      <AlbumShelfCard
        key={g.albumId}
        cover={a ? spotifyCovers[a.id] || a.cover : null}
        title={a?.title ?? '…'}
        artist={a?.artist ?? ''}
        artistId={a?.artistId}
        badge={d <= 0.05 ? '=' : `±${fmt1(d)}`}
        meta={<span className="sc24"><b>{t('friend.you')} {fmt1(g.mine)}</b><b>{active?.name} {fmt1(g.theirs)}</b></span>}
        onClick={() => openAlbum(g.albumId)}
      />
    );
  };
  const leaderUser = leaderboard[0]?.user ?? null;

  return (
    <>
      <p className="eyebrow muted">{t('match.eyebrow')}</p>
      <h1 className="big">{t('match.title')}</h1>

      {/* Your friends as round faces, each ringed by how close your taste is. */}
      <div className="hrow fp24" role="tablist" aria-label={t('match.title')}>
        {ranked.map((f) => {
          const score = info[f.id]?.score ?? null;
          return (
            <button key={f.id} role="tab" aria-selected={f.id === activeId} className={f.id === activeId ? 'on' : ''} onClick={() => setSelectedId(f.id)}>
              <span className="rg">
                <svg viewBox="0 0 72 72" aria-hidden="true"><circle className="tr" cx="36" cy="36" r="33" /><circle className="pg" cx="36" cy="36" r="33" strokeDasharray={RING} strokeDashoffset={RING * (1 - (score ?? 0) / 100)} /></svg>
                <span className="avt" style={{ ...userAvatarStyle(f), backgroundSize: 'cover' }}>{!f.avatarUrl && f.name[0]?.toUpperCase()}</span>
              </span>
              <b>{f.name}</b>
              <small>{score != null ? `${score}%` : '–'}</small>
            </button>
          );
        })}
      </div>

      {/* The two of you over a picture: both faces, the %, how it moved. */}
      <div className={`tile bh15 mh24${heroPicture ? '' : ' np'}`} style={blurStyle(heroPicture, 300)}>
        <div className="duo">
          {[me, active].map((u, i) => u && <span key={i} className="avt" style={{ ...userAvatarStyle(u), backgroundSize: 'cover' }}>{!u.avatarUrl && u.name[0]?.toUpperCase()}</span>)}
        </div>
        <p className="who">{t('match.youAndName', { name: active?.name ?? '' })}</p>
        <div className="pc"><span className="num">{shownPct ?? '–'}</span>{shownPct != null && <span className="num ps">%</span>}</div>
        <p className="sm">{t('match.tasteMatchSummary', { count: sharedArt.length })}</p>
        {history && history.length >= 2 && <Sparkline points={history.map((h) => h.pct)} />}
        {trendDelta != null && trendDelta !== 0 && (
          <span className="pill">{t(trendDelta > 0 ? 'match.pctUpSince' : 'match.pctDownSince', { delta: Math.abs(trendDelta), date: trendDate })}</span>
        )}
        <div className="acts">
          <button className="btn" onClick={() => active && viewFriend(active.id)}>{t('match.viewProfile', { name: active?.name ?? '' })}</button>
        </div>
      </div>

      {agree.length > 0 && <Shelf title={t('match.agreeTitle')}>{agree.slice(0, 12).map(albumCard)}</Shelf>}
      {disagree.length > 0
        ? <Shelf title={t('match.whereYouDisagree')}>{disagree.slice(0, 12).map(albumCard)}</Shelf>
        : !agree.length && (
          <div className="sec"><h2>{t('match.whereYouDisagree')}</h2><p className="muted" style={{ fontWeight: 600 }}>{t('match.notEnoughForGaps')}</p></div>
        )}

      {sharedArt.length > 0 ? (
        <Shelf title={t('match.sharedArtistsTitle')}>
          {sharedArt.slice(0, 12).map((name) => {
            const id = artistIdOf.get(name.toLowerCase()) ?? null;
            return <ArtistShelfCard key={name} name={name} id={id} onClick={() => openArtist(name, id)} />;
          })}
        </Shelf>
      ) : (
        <div className="sec"><h2>{t('match.sharedArtistsTitle')}</h2><p className="muted" style={{ fontWeight: 600 }}>{t('match.noSharedArtists')}</p></div>
      )}

      {/* The week's listening, over the leader's photo. */}
      <div className="sec">
        <div className={`tile bh15 lb24${leaderUser?.avatarUrl ? '' : ' np'}`} style={blurStyle(leaderUser?.avatarUrl ?? null, 300)}>
          <h2>{t('match.weeklyLeaderboard')}</h2>
          <RankRows
            label={t('match.weeklyLeaderboard')}
            rows={leaderboard.slice(0, 5).map((l) => ({ id: l.id, name: l.name, avatarUrl: l.user?.avatarUrl ?? null, amount: l.hours, value: `${fmtHours(l.hours)}${t('unit.h')}`, you: l.id === 'me' }))}
            onOpen={viewFriend}
          />
          {myRank >= 5 && <p className="gap10"><i className="ic ic-medal" /><span>{t('match.yourPlace', { n: myRank + 1, h: fmtHours(leaderboard[myRank].hours) })}</span></p>}
          {gapHint && <p className="gap10"><i className="ic ic-trend" /><span>{gapHint}</span></p>}
        </div>
      </div>

      {discover !== null && discover.length > 0 && (
        <div className="sec">
          <h2>{t('match.discoverTitle')}</h2>
          <PersonCards people={discover.slice(0, 10).map((p) => ({
            id: p.id, name: p.name, avatarUrl: p.avatarUrl, value: `${p.score}%`, onClick: () => viewFriend(p.id),
            action: friendRequests.outgoing.some((r) => r.user.id === p.id)
              ? <span className="tag" style={{ alignSelf: 'center' }}>{t('friend.requestSent')}</span>
              : <button className="btn" onClick={() => addFriend(p.handle)}>{t('friend.addFriend')}</button>,
          }))} />
        </div>
      )}
    </>
  );
}

// The match over time as one line (the snapshots, oldest to newest).
function Sparkline({ points }: { points: number[] }) {
  const min = Math.min(...points), max = Math.max(...points);
  const span = Math.max(1, max - min);
  const d = points.map((p, i) => `${(i / (points.length - 1)) * 100},${28 - ((p - min) / span) * 24}`).join(' ');
  return (
    <svg className="sp24" viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={d} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
