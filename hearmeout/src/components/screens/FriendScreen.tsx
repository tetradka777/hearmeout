'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useApp } from '@/lib/AppContext';
import type { Device, PublicProfile, StatsData } from '@/lib/types';
import { userAvatarStyle } from '@/lib/format';
import { RecapOpenButton, Top4Grid } from '../ProfileBlocks';
import { CoverArt } from '../ui/CoverArt';
import { toLocale, pluralForKey } from '@/lib/i18n';
import { drawBlendPoster } from '@/lib/posterCanvas';
import { isDemoAccountId } from '@/lib/demoAccounts';

function BlendButton({ me, friend, friendName, matchPct }: { me: string; friend: string; friendName: string; matchPct: number | null }) {
  const { t, ensureRecap, recapCache } = useApp();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    ensureRecap('me', 'month');
    ensureRecap(friend, 'month');
  }, [friend, ensureRecap]);

  const dataA = recapCache[`${me}:month`];
  const dataB = recapCache[`${friend}:month`];
  if (!dataA || !dataB) return null;

  const download = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawBlendPoster(canvas, dataA, t('friend.you'), dataB, friendName, matchPct);
    const url = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.href = url;
    link.download = 'hearmeout-blend.png';
    link.click();
  };

  return (
    <>
      <button className="btn ghost" onClick={download}>{t('friend.downloadBlend')}</button>
      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </>
  );
}

// Shared row style for both "Both scores" (mutually-rated albums only) and
// "Latest ratings" (friend's own recent ratings, yours alongside if you
// have one) — the prototype uses the identical two-big-numbers layout for
// both, differing only in which list feeds it and whether a "big gap" tag
// and the one highlighted "biggest disagreement" row apply.
function ScoreCompareRow({ albumId, mine, theirs, friendName, highlight }: {
  albumId: string; mine: number | null; theirs: number; friendName: string; highlight?: boolean;
}) {
  const { t, albums, liveAlbums, spotifyCovers, openAlbum } = useApp();
  const a = liveAlbums[albumId] || albums.find((x) => x.id === albumId);
  if (!a) return null;
  const cover = spotifyCovers[a.id] || a.cover;
  const bigGap = mine != null && Math.abs(mine - theirs) >= 1.5;
  return (
    <button className={`row${bigGap ? ' gapbig' : ''}${highlight ? ' bigd' : ''}`} onClick={() => openAlbum(a.id)} style={{ cursor: 'pointer' }}>
      <CoverArt url={cover} fallbackLetter={a.artist[0] || '?'} className="cov" style={{ width: highlight ? 56 : 44, height: highlight ? 56 : 44 }} />
      <div className="g">
        <b>{highlight ? t('friend.biggestGap') : a.title}</b>
        <div className="muted">
          {highlight
            ? `${a.title} · ${t('friend.starsApart', { diff: mine != null ? Math.abs(mine - theirs).toFixed(1) : '—' })}`
            : a.artist}
        </div>
      </div>
      {bigGap && !highlight && <span className="tag" style={{ background: 'var(--acc)', color: 'var(--onacc)' }}>{t('friend.bigGapTag')}</span>}
      <span style={{ textAlign: 'center', minWidth: 48 }}>
        <span className="num" style={{ fontSize: highlight ? 28 : 24, color: 'var(--acct)' }}>{theirs.toFixed(1)}</span>
        <br /><small className="muted" style={{ fontWeight: 700 }}>{friendName}</small>
      </span>
      <span style={{ textAlign: 'center', minWidth: 48 }}>
        {mine != null ? <span className="num" style={{ fontSize: highlight ? 28 : 24 }}>{mine.toFixed(1)}</span> : <small className="muted">{t('friend.notRatedByYou')}</small>}
        {mine != null && <><br /><small className="muted" style={{ fontWeight: 700 }}>{t('friend.you')}</small></>}
      </span>
    </button>
  );
}

function PersonListRow({ user, action }: { user: NonNullable<PublicProfile['friends']>[number]; action?: ReactNode }) {
  const { viewFriend } = useApp();
  return (
    <div className="row">
      <button className="rowlink" onClick={() => viewFriend(user.id)}>
        <div className="dot" style={userAvatarStyle(user)}>{user.name[0]}</div>
        <div className="g"><b>{user.name}</b><div className="muted">{user.handle}</div></div>
      </button>
      {action}
    </div>
  );
}

function FriendsOfFriendRow({ user }: { user: NonNullable<PublicProfile['friends']>[number] }) {
  const { t, me, friendRequests, addFriend } = useApp();
  if (!me) return null;
  const isMe = user.id === me.id;
  const isFriend = me.friends.some((fr) => fr.id === user.id);
  const isPending = friendRequests.outgoing.some((r) => r.user.id === user.id);
  return (
    <PersonListRow user={user} action={
      isMe ? null : isFriend ? <span className="tag">{t('friend.alreadyFriend')}</span> : isPending ? <span className="tag">{t('friend.requestSent')}</span> :
      <button className="chip" onClick={() => addFriend(user.handle)}>{t('friend.addThem')}</button>
    } />
  );
}

export function FriendScreen({ device }: { device: Device }) {
  const { t, language, state, me, myRatings, friendRequests, addFriend, goBack, showScreen } = useApp();
  const [f, setF] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [matchHistory, setMatchHistory] = useState<{ pct: number; date: string }[] | null>(null);
  const [myStats, setMyStats] = useState<StatsData | null>(null);
  const [friendStats, setFriendStats] = useState<StatsData | null>(null);

  useEffect(() => {
    if (!state.viewingUserId) { setF(null); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    const load = (showSpinner: boolean) => {
      if (showSpinner) setLoading(true);
      fetch(`/api/users/${state.viewingUserId}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => { if (!cancelled) { setF(data); setLoading(false); } });
    };
    load(true);
    const interval = setInterval(() => load(false), 30_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [state.viewingUserId]);

  const myScoreByAlbum = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of myRatings) map.set(r.albumId, r.stars);
    return map;
  }, [myRatings]);

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
  const avgGap = useMemo(() => shared.length ? shared.reduce((s, x) => s + Math.abs(x.mine - x.theirs), 0) / shared.length : null, [shared]);
  const agreeCount = useMemo(() => shared.filter((x) => Math.abs(x.mine - x.theirs) <= 0.5).length, [shared]);

  const mutualFriends = useMemo(() => {
    if (!f?.friends || !me) return [];
    return me.friends.filter((mf) => f.friends!.some((ff) => ff.id === mf.id));
  }, [f, me]);

  const overlap = useMemo(() => {
    if (!f || !me) return [];
    return me.genres.map((mg) => {
      const fg = f.genres.find((x) => x.g === mg.g);
      return { g: mg.g, me: mg.pct, friend: fg ? fg.pct : 0 };
    });
  }, [f, me]);
  const matchScore = useMemo(() => {
    const denom = overlap.reduce((s, o) => s + Math.max(o.me, o.friend), 0);
    return denom > 0 ? Math.round((overlap.reduce((s, o) => s + Math.min(o.me, o.friend), 0) / denom) * 100) : null;
  }, [overlap]);
  // Sum of per-genre min(you%, them%) across the shown genres — the
  // prototype's "{N}% shared" headline on the Genre overlap tile, a
  // different (simpler, unnormalized) metric than the taste-match % above.
  const sharedGenrePct = useMemo(() => overlap.length ? Math.round(overlap.reduce((s, o) => s + Math.min(o.me, o.friend), 0)) : null, [overlap]);

  useEffect(() => {
    if (!f || f.locked || matchScore == null) return;
    fetch('/api/match/snapshot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ friendId: f.id, pct: matchScore }) }).catch(() => {});
  }, [f, matchScore]);

  useEffect(() => {
    if (!f || f.locked) { setMatchHistory(null); return; }
    let cancelled = false;
    fetch(`/api/match/${f.id}/history`).then((r) => (r.ok ? r.json() : { history: [] })).then((d) => { if (!cancelled) setMatchHistory(d.history); });
    return () => { cancelled = true; };
  }, [f?.id, f?.locked]);

  useEffect(() => {
    if (!f || f.locked) { setMyStats(null); setFriendStats(null); return; }
    let cancelled = false;
    Promise.all([
      fetch('/api/stats?range=6m').then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/stats?range=6m&userId=${f.id}`).then((r) => (r.ok ? r.json() : null)),
    ]).then(([mine, theirs]) => { if (!cancelled) { setMyStats(mine); setFriendStats(theirs); } });
    return () => { cancelled = true; };
  }, [f?.id]);

  if (loading) return <div className="muted">{t('friend.loadingProfile')}</div>;
  if (!f || !me) {
    return (
      <>
        <button className="crumb" onClick={() => goBack('profile')}>‹ {t('friend.back')}</button>
        <div className="tile empty"><p>{t('friend.notFound')}</p></div>
      </>
    );
  }

  const isFriend = me.friends.some((fr) => fr.id === f.id);
  const isPending = friendRequests.outgoing.some((r) => r.user.id === f.id);
  const isFullView = !!f.recentRatings;

  const statusButton = isDemoAccountId(f.id) ? (
    <span className="tag">{t('friend.demoLabel')}</span>
  ) : isFriend ? (
    <span className="tag">{t('friend.alreadyFriend')}</span>
  ) : isPending ? (
    <span className="tag">{t('friend.requestSent')}</span>
  ) : (
    <button className="btn" onClick={() => addFriend(f.handle)}>{t('friend.addThem')}</button>
  );

  if (f.locked) {
    return (
      <>
        <button className="crumb" onClick={() => goBack('profile')}>‹ {t('friend.back')}</button>
        <div className="tile t-ink hero">
          <div className="eyebrow muted">{isFriend ? t('friend.eyebrowFriend') : t('friend.eyebrowPerson')}</div>
          <div className="dot" style={{ ...userAvatarStyle(f), width: 76, height: 76, fontSize: 28 }}>{f.name[0]}</div>
          <h1>{f.name}</h1>
          <p className="muted">{f.handle}</p>
          <div className="acts">{statusButton}</div>
        </div>
        <div className="tile t-soft2 empty" style={{ marginTop: 14 }}>
          <span className="num" style={{ fontSize: 54 }}>🔒</span>
          <h3>{t('friend.closedProfileTitle')}</h3>
          <p className="muted" style={{ fontWeight: 600 }}>{t('friend.lockedHint', { name: f.name })}</p>
        </div>
      </>
    );
  }

  return (
    <>
      <button className="crumb" onClick={() => goBack('profile')}>‹ {t('friend.back')}</button>

      <div className="tile t-ink hero">
        <div className="duel" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div className="eyebrow muted">{isFriend ? t('friend.eyebrowFriend') : t('friend.eyebrowPerson')}</div>
            <div className="dot" style={{ ...userAvatarStyle(f), width: 76, height: 76, fontSize: 28 }}>{f.name[0]}</div>
            <h1 style={{ marginTop: 14 }}>{f.name}</h1>
            <p className="muted">{f.handle}</p>
            {f.nowPlaying && (
              <div className="nowl"><span className="eq"><b /><b /><b /></span>{t('friend.nowPlaying', { title: f.nowPlaying.title, artist: f.nowPlaying.artist })}</div>
            )}
            <div className="acts">{statusButton}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            {matchScore != null ? (
              <><span className="pcts">{matchScore}%</span><div className="muted">{t('friend.matchScore')}</div></>
            ) : <div className="muted">{t('friend.notEnoughCompare')}</div>}
          </div>
        </div>
      </div>

      <div className="acts" style={{ marginTop: 14, marginBottom: 14 }}>
        <button className="btn" onClick={() => showScreen('match')}>{t('friend.compare')}</button>
        <RecapOpenButton userId={f.id} label={t('friend.recapOf', { name: f.name.split(' ')[0] })} />
        <BlendButton me={me.id} friend={f.id} friendName={f.name.split(' ')[0]} matchPct={matchScore} />
      </div>

      {isFullView && shared.length > 0 && (
        <div className="stats3">
          <div className="tile"><span className="num">{shared.length}</span><small className="muted">{t('friend.sharedRatings')}</small></div>
          <div className="tile"><span className="num">{avgGap?.toFixed(1) ?? '—'}</span><small className="muted">{t('friend.avgGap')}</small></div>
          <div className="tile"><span className="num">{agreeCount}</span><small className="muted">{t('friend.youAgree')}</small></div>
        </div>
      )}

      <div className="bento b3">
        {isFullView && shared.length > 0 && (
          <div className="tile s2">
            <h3>{t('friend.bothLabel')}</h3>
            <div className="stack" style={{ marginTop: 10 }}>
              {biggestGap && <ScoreCompareRow albumId={biggestGap.albumId} mine={biggestGap.mine} theirs={biggestGap.theirs} friendName={f.name.split(' ')[0]} highlight />}
              {shared.map((s) => <ScoreCompareRow key={s.albumId} albumId={s.albumId} mine={s.mine} theirs={s.theirs} friendName={f.name.split(' ')[0]} />)}
            </div>
          </div>
        )}

        {matchHistory && matchHistory.length >= 2 && (
          <div className="tile">
            <h3>{t('friend.matchTrend')}</h3>
            <div className="bars" style={{ marginTop: 10 }}>
              {matchHistory.map((h, i) => <i key={i} style={{ height: `${Math.max(6, h.pct)}%` }} title={`${new Date(h.date).toLocaleDateString(toLocale(language), { day: '2-digit', month: 'short' })}: ${h.pct}%`} />)}
            </div>
            <div className="axis">
              <span>{new Date(matchHistory[0].date).toLocaleDateString(toLocale(language), { day: '2-digit', month: 'short' })}</span>
              <span>{new Date(matchHistory[matchHistory.length - 1].date).toLocaleDateString(toLocale(language), { day: '2-digit', month: 'short' })}</span>
            </div>
            <p className="muted" style={{ fontSize: 13, fontWeight: 600, marginTop: 8 }}>
              {t('friend.snapshotsCaption', { count: matchHistory.length, word: pluralForKey(language, matchHistory.length, 'friend.snapshotOne', 'friend.snapshotFew', 'friend.snapshotMany') })}
            </p>
          </div>
        )}

        {overlap.length > 0 && (
          <div className="tile">
            <h3>{t('friend.genreOverlap')}</h3>
            {sharedGenrePct != null && (
              <p style={{ fontWeight: 800, margin: '-6px 0 12px' }}><span className="num" style={{ fontSize: 34, color: 'var(--acct)' }}>{sharedGenrePct}%</span> {t('friend.sharedLabel')}</p>
            )}
            {overlap.map((o) => (
              <div className="gap" key={o.g}>
                <div className="hd"><b>{o.g}</b></div>
                <div className="cmpb"><i className="a" style={{ width: `${o.me}%` }} /><i className="b" style={{ width: `${o.friend}%` }} /></div>
              </div>
            ))}
            <div className="acts" style={{ marginTop: 10 }}>
              <span><i className="lg1" />{t('friend.you')}</span>
              <span><i className="lg2" />{f.name.split(' ')[0]}</span>
            </div>
          </div>
        )}

        {myStats && friendStats && (myStats.topArtists.length > 0 || friendStats.topArtists.length > 0) && (
          <div className="tile s2">
            <h3>{t('friend.topArtistsCompare')}</h3>
            <p className="muted" style={{ fontWeight: 600, margin: '-6px 0 10px' }}>{t('friend.topArtistsSubtitle', { name: f.name.split(' ')[0] })}</p>
            <div className="two" style={{ marginTop: 10 }}>
              {[{ label: t('friend.you'), stats: myStats }, { label: f.name.split(' ')[0], stats: friendStats }].map(({ label, stats }, side) => {
                const top = stats.topArtists.slice(0, 5);
                const max = Math.max(1, ...top.map((a) => a.hours));
                return (
                  <div key={side}>
                    <b>{label}</b>
                    {top.length ? top.map((a) => (
                      <div className="row" key={a.id || a.name}>
                        <div className="g"><b>{a.name}</b></div>
                        <div className="meter"><i style={{ width: `${(a.hours / max) * 100}%` }} /></div>
                      </div>
                    )) : <p className="muted">{t('stats.notEnough')}</p>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="tile s2">
          <h3>{t('friend.top4')}</h3>
          <div style={{ marginTop: 10 }}><Top4Grid ids={f.top4Albums} /></div>
        </div>

        {isFullView && f.recentRatings && f.recentRatings.length > 0 && (
          <div className="tile s3">
            <h3>{t('friend.latestRatings')}</h3>
            <p className="muted" style={{ fontWeight: 600, margin: '-6px 0 8px' }}>{t('friend.latestRatingsSubtitle')}</p>
            <div className="stack" style={{ marginTop: 10 }}>
              {f.recentRatings.map((r) => <ScoreCompareRow key={r.albumId} albumId={r.albumId} mine={myScoreByAlbum.get(r.albumId) ?? null} theirs={r.stars} friendName={f.name.split(' ')[0]} />)}
            </div>
          </div>
        )}

        {isFullView && mutualFriends.length > 0 && (
          <div className="tile">
            <h3>{t('friend.mutualFriends')}</h3>
            <div className="stack" style={{ marginTop: 10 }}>{mutualFriends.map((u) => <PersonListRow key={u.id} user={u} />)}</div>
          </div>
        )}

        {isFullView && f.friends && (
          <div className="tile s2">
            <h3>{t('friend.friendsOf', { name: f.name.split(' ')[0] })}</h3>
            <div className="stack" style={{ marginTop: 10 }}>
              {f.friends.length ? f.friends.map((u) => <FriendsOfFriendRow key={u.id} user={u} />) : <p className="muted">{t('friend.noFriends')}</p>}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
