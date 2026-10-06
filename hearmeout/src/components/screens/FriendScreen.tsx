'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '@/lib/AppContext';
import type { ApiUser, Device, PublicProfile, StatsData } from '@/lib/types';
import { formatRelative, userAvatarStyle } from '@/lib/format';
import { computeMatch } from '@/lib/matchScore';
import { CoverArt } from '../ui/CoverArt';
import { toLocale, pluralForKey, type TranslationKey } from '@/lib/i18n';
import { isDemoAccountId } from '@/lib/demoAccounts';
import { BlendButton } from '../BlendButton';
import { MascotIcon } from '../redesign/icons';
import { MATCH_FRIEND_EVENT } from '@/lib/uiEvents';
import { useFriendScores } from '@/lib/useFriendScores';

function useAlbumInfo(albumId: string) {
  const { albums, liveAlbums, spotifyCovers } = useApp();
  const a = liveAlbums[albumId] || albums.find((x) => x.id === albumId);
  return { title: a?.title ?? albumId, artist: a?.artist ?? '', cover: a ? spotifyCovers[a.id] || a.cover : undefined };
}

function ScoreCell({ value, label, size, accent }: { value: number | null; label: string; size: number; accent?: boolean }) {
  return (
    <span style={{ textAlign: 'center', minWidth: 48 }}>
      <span className="num" style={{ fontSize: size, color: accent ? 'var(--acct)' : undefined }}>{value != null ? value.toFixed(1) : '–'}</span>
      <br /><small className="muted" style={{ fontWeight: 700 }}>{label}</small>
    </span>
  );
}

// vFriend() "Both scores": you first, then the friend.
function BothRow({ albumId, mine, theirs, name, biggest }: { albumId: string; mine: number; theirs: number; name: string; biggest?: boolean }) {
  const { t, openAlbum } = useApp();
  const a = useAlbumInfo(albumId);
  const size = biggest ? 56 : 44;
  return (
    <button className={`row${biggest ? ' bigd' : ''}`} onClick={() => openAlbum(albumId)}>
      <CoverArt url={a.cover} fallbackLetter={a.artist[0] || '?'} className="cov" style={{ width: size, height: size }} />
      <span className="g">
        <b>{biggest ? t('friend.biggestGap') : a.title}</b>
        <small className="muted" style={{ fontWeight: 600 }}>{biggest ? `${a.title} · ${t('friend.starsApart', { diff: Math.abs(mine - theirs).toFixed(1) })}` : a.artist}</small>
      </span>
      <ScoreCell value={mine} label={t('friend.you')} size={biggest ? 28 : 24} />
      <ScoreCell value={theirs} label={name} size={biggest ? 28 : 24} accent />
    </button>
  );
}

// "Latest ratings": the friend's score first, yours next to it, and a
// "big gap" tag at 1.5 stars or more.
function LatestRow({ albumId, mine, theirs, name }: { albumId: string; mine: number | null; theirs: number; name: string }) {
  const { t, openAlbum } = useApp();
  const a = useAlbumInfo(albumId);
  const big = mine != null && Math.abs(mine - theirs) >= 1.5;
  return (
    <button className={`row${big ? ' gapbig' : ''}`} onClick={() => openAlbum(albumId)}>
      <CoverArt url={a.cover} fallbackLetter={a.artist[0] || '?'} className="cov" style={{ width: 44, height: 44 }} />
      <span className="g"><b>{a.title}</b><small className="muted" style={{ fontWeight: 600 }}>{a.artist}</small></span>
      {big && <span className="tag" style={{ background: 'var(--acc)', color: 'var(--onacc)' }}>{t('friend.bigGapTag')}</span>}
      <ScoreCell value={theirs} label={name} size={24} accent />
      <ScoreCell value={mine} label={t('friend.you')} size={24} />
    </button>
  );
}

function Top4Tile({ ids, scores }: { ids: string[]; scores: Map<string, number> }) {
  const { t, albums, liveAlbums, spotifyCovers, openAlbum } = useApp();
  const shown = ids.map((id) => ({ id, a: liveAlbums[id] || albums.find((x) => x.id === id) })).filter((x) => x.a);
  if (!shown.length) return <p className="muted" style={{ fontWeight: 600 }}>{t('profile.noRatingsYet')}</p>;
  return (
    <div className="t4">
      {shown.map(({ id, a }) => (
        <button key={id} onClick={() => openAlbum(id)} style={{ textAlign: 'left', color: 'inherit' }}>
          <div className="cvw">
            <CoverArt url={spotifyCovers[a!.id] || a!.cover} fallbackLetter={a!.artist[0] || '?'} className="cov" style={{ width: '100%', aspectRatio: '1' }} />
            {scores.has(id) && <span className="bdg">{scores.get(id)!.toFixed(1)}</span>}
          </div>
          <b style={{ display: 'block', marginTop: 8, fontSize: 14 }}>{a!.title}</b>
        </button>
      ))}
    </div>
  );
}

// personRow() + friendBtn(n, true): avatar, name, "@handle", then the
// relationship button.
function PersonRow({ user }: { user: ApiUser }) {
  const { t, me, friendRequests, addFriend, respondToFriendRequest, viewFriend } = useApp();
  if (!me) return null;
  const sm = { padding: '8px 16px' };
  const out = friendRequests.outgoing.find((r) => r.user.id === user.id);
  const inc = friendRequests.incoming.find((r) => r.user.id === user.id);
  const btn = user.id === me.id ? null
    : me.friends.some((f) => f.id === user.id) ? <span className="tag">{t('friend.friendsTag')}</span>
    : out ? <button className="btn ghost" style={sm} onClick={() => respondToFriendRequest(out.id, 'cancel')}>{t('friend.requestSent')}</button>
    : inc ? <button className="btn" style={sm} onClick={() => respondToFriendRequest(inc.id, 'accept')}>{t('friends.accept')}</button>
    : <button className="btn" style={sm} onClick={() => addFriend(user.handle)}>{t('friend.addFriend')}</button>;
  return (
    <div className="row">
      <button className="rowlink" onClick={() => viewFriend(user.id)}>
        <span className="dot" style={userAvatarStyle(user)}>{!user.avatarUrl && user.name[0]}</span>
        <span className="g"><b>{user.name}</b><small className="muted" style={{ fontWeight: 600 }}>@{user.handle.replace(/^@/, '')}</small></span>
      </button>
      {btn}
    </div>
  );
}

// lineChart() in reference/app.js: match % per saved snapshot as a polyline
// with a dot per point (the last one larger), axis labels underneath.
function MatchLine({ points }: { points: number[] }) {
  const { t } = useApp();
  if (points.length < 2) return <p className="muted" style={{ fontWeight: 600 }}>{t('friend.lineEmpty')}</p>;
  const W = 300, H = 110;
  const mn = Math.min(...points) - 4, mx = Math.max(...points) + 4;
  const xy = points.map((v, i) => [8 + (i * (W - 16)) / (points.length - 1), H - 8 - ((v - mn) / (mx - mn || 1)) * (H - 16)] as const);
  const first = points[0], last = points[points.length - 1];
  return (
    <>
      <svg className="lc" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('friend.lineAria', { from: first, to: last })}>
        <polyline points={xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')} fill="none" stroke="var(--acct)" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
        {xy.map(([x, y], i) => <circle key={i} cx={x.toFixed(1)} cy={y.toFixed(1)} r={i === xy.length - 1 ? 5 : 3.5} fill="var(--acct)" />)}
      </svg>
      <div className="axis"><span>{t('friend.lineFrom', { pct: first })}</span><span>{t('friend.lineNow', { pct: last })}</span></div>
    </>
  );
}

export function FriendScreen({ device: _device }: { device: Device }) {
  const { t, language, state, me, myRatings, friendRequests, addFriend, respondToFriendRequest, removeFriend, sendHi, showScreen, openRecap, viewFriend, openSpotifyArtist, albums, liveAlbums, spotifyCovers, openAlbum } = useApp();
  const [confirmRemove, setConfirmRemove] = useState(false);
  const snapshotSent = useRef<string | null>(null);
  const [f, setF] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [matchHistory, setMatchHistory] = useState<{ pct: number; date: string }[] | null>(null);
  const [myStats, setMyStats] = useState<StatsData | null>(null);
  const [friendStats, setFriendStats] = useState<StatsData | null>(null);
  const myFriendScores = useFriendScores(me, 50);

  useEffect(() => {
    if (!state.viewingUserId) { setF(null); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    setConfirmRemove(false);
    // Loaded once per open (audit D3: it used to re-fetch every 30s and post
    // a match snapshot each time).
    fetch(`/api/users/${state.viewingUserId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (!cancelled) { setF(data); setLoading(false); } });
    return () => { cancelled = true; };
  }, [state.viewingUserId]);

  const myScoreByAlbum = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of myRatings) map.set(r.albumId, r.stars);
    return map;
  }, [myRatings]);

  const theirScoreByAlbum = useMemo(() => new Map((f?.recentRatings ?? []).map((r) => [r.albumId, r.stars])), [f]);

  const shared = useMemo(() => {
    if (!f?.recentRatings) return [];
    return f.recentRatings
      .filter((r) => myScoreByAlbum.has(r.albumId))
      .map((r) => ({ albumId: r.albumId, mine: myScoreByAlbum.get(r.albumId)!, theirs: r.stars }));
  }, [f, myScoreByAlbum]);

  const biggestGap = useMemo(() => {
    if (!shared.length) return null;
    return [...shared].sort((a, b) => Math.abs(b.mine - b.theirs) - Math.abs(a.mine - a.theirs))[0];
  }, [shared]);
  const avgGap = shared.length ? shared.reduce((s, x) => s + Math.abs(x.mine - x.theirs), 0) / shared.length : null;
  const agreeCount = shared.filter((x) => Math.abs(x.mine - x.theirs) <= 0.5).length;

  const mutualFriends = useMemo(() => {
    if (!f?.friends || !me) return [];
    return me.friends.filter((mf) => mf.id !== f.id && f.friends!.some((ff) => ff.id === mf.id));
  }, [f, me]);

  // Genre overlap tile: both people's genres (prototype: union, top 5 by
  // combined share), each with its two percentages.
  const overlap = useMemo(() => {
    if (!f || !me) return [];
    const names = [...new Set([...me.genres.map((g) => g.g), ...f.genres.map((g) => g.g)])];
    return names
      .map((g) => ({ g, me: me.genres.find((x) => x.g === g)?.pct ?? 0, friend: f.genres.find((x) => x.g === g)?.pct ?? 0 }))
      .sort((a, b) => (b.me + b.friend) - (a.me + a.friend))
      .slice(0, 5);
  }, [f, me]);
  // Same taste-match % as Match and Home (lib/matchScore.ts).
  const matchScore = useMemo(() => (f && me ? computeMatch(me.genres, f.genres) : null), [f, me]);
  // Sum of per-genre min(you%, them%) across the shown genres — the
  // prototype's "{N}% shared" headline on the Genre overlap tile.
  const sharedGenrePct = Math.round(overlap.reduce((s, o) => s + Math.min(o.me, o.friend), 0));

  // "Top artists, last 6 months": the friend's top names first, then
  // yours, five in all, each with both people's hours.
  const artistRows = useMemo(() => {
    if (!myStats || !friendStats) return [];
    const hours = (d: StatsData, name: string) => d.topArtists.find((a) => a.name === name)?.hours ?? 0;
    const seen = new Map<string, string | null>();
    for (const a of [...friendStats.topArtists, ...myStats.topArtists]) if (!seen.has(a.name)) seen.set(a.name, a.id || null);
    return [...seen.entries()].slice(0, 5).map(([name, id]) => ({ name, id, me: Math.round(hours(myStats, name)), them: Math.round(hours(friendStats, name)) }));
  }, [myStats, friendStats]);
  const maxHours = Math.max(1, ...artistRows.flatMap((r) => [r.me, r.them]));

  useEffect(() => {
    if (!f || f.locked || matchScore == null || snapshotSent.current === f.id) return;
    snapshotSent.current = f.id;
    fetch('/api/match/snapshot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ friendId: f.id, pct: matchScore }) }).catch(() => {});
  }, [f, matchScore]);

  useEffect(() => {
    if (!f || f.locked) { setMatchHistory(null); return; }
    let cancelled = false;
    fetch(`/api/match/${f.id}/history`).then((r) => (r.ok ? r.json() : { history: [] })).then((d) => { if (!cancelled) setMatchHistory(d.history); });
    return () => { cancelled = true; };
  }, [f?.id, f?.locked]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!f || f.locked) { setMyStats(null); setFriendStats(null); return; }
    let cancelled = false;
    Promise.all([
      fetch('/api/stats?range=6m').then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/stats?range=6m&userId=${f.id}`).then((r) => (r.ok ? r.json() : null)),
    ]).then(([mine, theirs]) => { if (!cancelled) { setMyStats(mine); setFriendStats(theirs); } });
    return () => { cancelled = true; };
  }, [f?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <div className="muted">{t('friend.loadingProfile')}</div>;
  if (!f || !me) {
    return (
      <div className="tile empty">
        <MascotIcon />
        <h3>{t('friend.notFound')}</h3>
        <button className="btn" onClick={() => showScreen('discover')}>{t('friend.findPeople')}</button>
      </div>
    );
  }

  const isFriend = me.friends.some((fr) => fr.id === f.id);
  const outgoing = friendRequests.outgoing.find((r) => r.user.id === f.id);
  const incoming = friendRequests.incoming.find((r) => r.user.id === f.id);
  const isFullView = !!f.recentRatings;
  const firstName = f.name.split(' ')[0];
  const demo = isDemoAccountId(f.id);

  // statusBlock() in reference/app.js: Friends ✓ (inline remove confirm),
  // Request sent · cancel, Accept/Decline, or Add friend.
  const statusButton = demo ? null : isFriend ? (
    confirmRemove ? (
      <span className="conf">
        <b>{t('friend.removeConfirm', { name: firstName })}</b>
        <button className="btn danger" onClick={async () => { if (await removeFriend(f.id)) setConfirmRemove(false); }}>{t('friend.remove')}</button>
        <button className="btn ghost" onClick={() => setConfirmRemove(false)}>{t('friend.keep')}</button>
      </span>
    ) : (
      <button className="btn ghost" onClick={() => setConfirmRemove(true)}>{t('friend.friendsCheck')}</button>
    )
  ) : outgoing ? (
    <button className="btn ghost" onClick={() => respondToFriendRequest(outgoing.id, 'cancel')}>{t('friend.requestSentCancel')}</button>
  ) : incoming ? (
    <>
      <button className="btn" onClick={() => respondToFriendRequest(incoming.id, 'accept')}>{t('friend.acceptRequest')}</button>
      <button className="btn ghost" onClick={() => respondToFriendRequest(incoming.id, 'decline')}>{t('friend.decline')}</button>
    </>
  ) : (
    <button className="btn" onClick={() => addFriend(f.handle)}>{t('friend.addFriend')}</button>
  );

  const head = (
    <div className="tile t-ink glow" style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
      <span className="avt lgA" style={userAvatarStyle(f)}>{!f.avatarUrl && f.name[0].toUpperCase()}</span>
      <div style={{ flex: 1, minWidth: 190 }}>
        <p className="eyebrow muted" style={{ margin: 0 }}>
          {isFriend ? t('friend.eyebrowFriend') : t('friend.eyebrowPerson')}
          {demo && <> · <span className="tag">{t('friends.demoTag')}</span></>}
        </p>
        <h1 className="big" style={{ margin: 0, fontSize: 'clamp(34px,7vw,60px)' }}>{f.name}</h1>
        <p className="muted" style={{ fontWeight: 600 }}>
          @{f.handle.replace(/^@/, '')}
          {isFriend && f.friendsSince ? ` · ${t('friend.friendsSince', { date: new Date(f.friendsSince).toLocaleDateString(toLocale(language), { month: 'long' }) })}` : ''}
        </p>
        {!f.locked && f.nowPlaying && (
          <p className="nowl"><span className="eqs"><span className="eq"><b /><b /><b /></span></span> {t('friend.nowPlaying', { title: f.nowPlaying.title, artist: f.nowPlaying.artist })}</p>
        )}
        <div className="acts" style={{ marginTop: 12 }}>{statusButton}</div>
      </div>
      {!f.locked && (
        <div style={{ textAlign: 'right' }}>
          <span className="num" style={{ fontSize: 72, color: 'var(--acct)' }}>{matchScore != null ? `${matchScore}%` : '–'}</span>
          <br /><small style={{ fontWeight: 800 }}>{t('friend.matchScore')}</small>
        </div>
      )}
    </div>
  );

  if (f.locked) {
    return (
      <>
        {head}
        <div className="tile t-soft2 empty" style={{ marginTop: 14 }}>
          <span className="num" style={{ fontSize: 54 }}>🔒</span>
          <h3>{t('friend.closedProfileTitle')}</h3>
          <p className="muted" style={{ fontWeight: 600 }}>{t('friend.lockedHint', { name: f.name })}</p>
        </div>
      </>
    );
  }

  const compare = () => { showScreen('match'); window.dispatchEvent(new CustomEvent(MATCH_FRIEND_EVENT, { detail: f.id })); };
  const snaps = matchHistory?.map((h) => h.pct) ?? (matchScore != null ? [matchScore] : []);
  const lp = f.lastPlayed ?? f.nowPlaying;

  return (
    <>
      {head}

      <div className="acts" style={{ margin: '14px 0 6px' }}>
        <button className="btn lg" onClick={compare}>{t('friend.compare')}</button>
        <button className="btn ghost lg" onClick={() => openRecap(f.id)}>{t('friend.recapOf', { name: firstName })}</button>
        <BlendButton me={me.id} friend={f.id} friendName={firstName} matchPct={matchScore} className="btn ghost lg" />
        {isFriend && <button className="btn ghost lg" onClick={() => sendHi(f.id)}>{t('friend.sayHi')}</button>}
      </div>

      <div className="stats3">
        <div className="tile t-pop"><span className="num">{shared.length}</span><small>{t('friend.sharedRatings')}</small></div>
        <div className="tile t-ac"><span className="num">{avgGap != null ? avgGap.toFixed(1) : '–'}</span><small>{t('friend.avgGap')}</small></div>
        <div className="tile t-ink"><span className="num">{agreeCount}</span><small>{t('friend.youAgree')}</small></div>
      </div>

      <div className="bento b3">
        <div className="tile s2">
          <h2>{t('friend.bothLabel')}</h2>
          {biggestGap
            ? <BothRow albumId={biggestGap.albumId} mine={biggestGap.mine} theirs={biggestGap.theirs} name={firstName} biggest />
            : <p className="muted" style={{ fontWeight: 600 }}>{isFullView ? t('friend.noSharedYet') : t('friend.reducedNote')}</p>}
          {shared.map((s) => <BothRow key={s.albumId} albumId={s.albumId} mine={s.mine} theirs={s.theirs} name={firstName} />)}
        </div>

        <div className="tile t-soft2">
          <h2>{t('friend.matchTrend')}</h2>
          <MatchLine points={snaps} />
          <p className="muted" style={{ fontSize: 13, fontWeight: 600, marginTop: 8 }}>
            {t('friend.snapshotsCaption', { count: snaps.length, word: pluralForKey(language, snaps.length, 'friend.snapshotOne', 'friend.snapshotFew', 'friend.snapshotMany') })}
          </p>
        </div>

        <div className="tile">
          <h2>{t('friend.genreOverlap')}</h2>
          <p style={{ fontWeight: 800, margin: '-6px 0 12px' }}><span className="num" style={{ fontSize: 34, color: 'var(--acct)' }}>{sharedGenrePct}%</span> {t('friend.sharedLabel')}</p>
          {overlap.map((o) => (
            <div className="cmp" key={o.g}>
              <small style={{ fontWeight: 800 }}>{o.g}</small>
              <div className="cmpb"><i className="a" style={{ width: `${o.me}%` }} /><b>{o.me}%</b></div>
              <div className="cmpb"><i className="b" style={{ width: `${o.friend}%` }} /><b>{o.friend}%</b></div>
            </div>
          ))}
          <p className="muted" style={{ fontSize: 12, fontWeight: 700, marginTop: 8 }}><span className="lg1" /> {t('friend.youLower')} <span className="lg2" /> {firstName}</p>
        </div>

        <div className="tile s2">
          <h2>{t('friend.topArtistsCompare')}</h2>
          <p className="muted" style={{ fontWeight: 600, margin: '-6px 0 10px' }}>{t('friend.topArtistsSubtitle', { name: firstName })}</p>
          {artistRows.length ? artistRows.map((r) => (
            <button className="cmp" key={r.name} onClick={() => r.id && openSpotifyArtist(r.id, r.name)} style={{ textAlign: 'left', width: '100%' }}>
              <small style={{ fontWeight: 800 }}>{r.name}</small>
              <div className="cmpb"><i className="a" style={{ width: `${Math.round((r.me / maxHours) * 100)}%` }} /><b>{r.me}{t('unit.h')}</b></div>
              <div className="cmpb"><i className="b" style={{ width: `${Math.round((r.them / maxHours) * 100)}%` }} /><b>{r.them}{t('unit.h')}</b></div>
            </button>
          )) : <p className="muted" style={{ fontWeight: 600 }}>{myStats && friendStats ? t('stats.notEnough') : t('stats.loading')}</p>}
        </div>

        {lp && (() => {
          const a = lp.albumId ? liveAlbums[lp.albumId] || albums.find((x) => x.id === lp.albumId) : undefined;
          const cover = (a && (spotifyCovers[a.id] || a.cover)) || lp.cover || undefined;
          return (
            <button className="tile t-pop" onClick={() => a && openAlbum(a.id)} style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', textAlign: 'left', cursor: a ? 'pointer' : 'default' }}>
              <CoverArt url={cover} fallbackLetter={lp.artist[0] || '?'} className="cov" style={{ width: 72, height: 72 }} />
              <div>
                <small style={{ fontWeight: 800 }}>{f.nowPlaying ? t('friend.listeningNow') : t('friend.lastPlayedAgo', { time: formatRelative(lp.startedAt, language) })}</small>
                <h3>{a?.title ?? lp.title}</h3>
                <p className="muted" style={{ fontWeight: 600 }}>{lp.artist}</p>
              </div>
            </button>
          );
        })()}

        <div className="tile s2">
          <h2>{t('friend.top4', { name: firstName })}</h2>
          <Top4Tile ids={f.top4Albums} scores={theirScoreByAlbum} />
        </div>

        <div className="tile">
          <h2>{t('friend.awards')}</h2>
          <div className="chips" style={{ margin: 0 }}>
            {f.awards?.length
              ? f.awards.map((aw) => <span className="chip on" key={aw.label}>{t(`groups.${aw.label}` as TranslationKey)}</span>)
              : <span className="muted" style={{ fontWeight: 600 }}>{t('friend.noAwards')}</span>}
          </div>
        </div>

        {isFullView && (
          <div className="tile s3">
            <h2>{t('friend.latestRatings')}</h2>
            <p className="muted" style={{ fontWeight: 600, margin: '-6px 0 8px' }}>{t('friend.latestRatingsSubtitle')}</p>
            {f.recentRatings!.length
              ? [...f.recentRatings!].sort((a, b) => b.stars - a.stars).slice(0, 8).map((r) => <LatestRow key={r.albumId} albumId={r.albumId} mine={myScoreByAlbum.get(r.albumId) ?? null} theirs={r.stars} name={firstName} />)
              : <p className="muted" style={{ fontWeight: 600 }}>{t('profile.noRatingsYet')}</p>}
          </div>
        )}

        <div className="tile">
          <h2>{t('friend.mutualFriends')}</h2>
          {mutualFriends.length ? mutualFriends.map((u) => (
            <button className="row" key={u.id} onClick={() => viewFriend(u.id)}>
              <span className="dot" style={userAvatarStyle(u)}>{!u.avatarUrl && u.name[0]}</span>
              <b className="g">{u.name}</b>
              <span className="num" style={{ fontSize: 26 }}>{myFriendScores[u.id]?.pct != null ? `${myFriendScores[u.id]!.pct}%` : '–'}</span>
            </button>
          )) : <p className="muted" style={{ fontWeight: 600 }}>{t('friend.noMutual')}</p>}
        </div>

        {f.friends && (
          <div className="tile s2">
            <h2>{t('friend.friendsOf', { name: firstName })}</h2>
            <p className="muted" style={{ fontWeight: 600, margin: '-6px 0 8px' }}>{t('friend.friendsOfSub', { name: firstName })}</p>
            {f.friends.filter((u) => u.id !== me.id && !me.friends.some((m) => m.id === u.id)).length
              ? f.friends.filter((u) => u.id !== me.id && !me.friends.some((m) => m.id === u.id)).map((u) => <PersonRow key={u.id} user={u} />)
              : <p className="muted" style={{ fontWeight: 600 }}>{t('friend.noFriends')}</p>}
          </div>
        )}
      </div>
    </>
  );
}
