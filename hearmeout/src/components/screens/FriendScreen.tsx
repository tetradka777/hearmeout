'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useApp } from '@/lib/AppContext';
import type { Device, PublicProfile, StatsData } from '@/lib/types';
import { formatRelative, userAvatarStyle } from '@/lib/format';
import { computeMatch } from '@/lib/matchScore';
import { RecapOpenButton, Top4Grid } from '../ProfileBlocks';
import { CoverArt } from '../ui/CoverArt';
import { toLocale, pluralForKey, type TranslationKey } from '@/lib/i18n';
import { isDemoAccountId } from '@/lib/demoAccounts';
import { BlendButton } from '../BlendButton';

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

// lineChart() in reference/app.js: match % per saved snapshot as a polyline
// with a dot per point (the last one larger), axis labels underneath.
function MatchLine({ points }: { points: number[] }) {
  const { t } = useApp();
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

export function FriendScreen({ device }: { device: Device }) {
  const { t, language, state, me, myRatings, friendRequests, addFriend, respondToFriendRequest, removeFriend, showToast, goBack, showScreen, albums, liveAlbums, spotifyCovers, openAlbum } = useApp();
  const [confirmRemove, setConfirmRemove] = useState(false);
  const snapshotSent = useRef<string | null>(null);
  const [f, setF] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [matchHistory, setMatchHistory] = useState<{ pct: number; date: string }[] | null>(null);
  const [myStats, setMyStats] = useState<StatsData | null>(null);
  const [friendStats, setFriendStats] = useState<StatsData | null>(null);

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
  // prototype's "{N}% shared" headline on the Genre overlap tile, a
  // different (simpler, unnormalized) metric than the taste-match % above.
  const sharedGenrePct = useMemo(() => overlap.length ? Math.round(overlap.reduce((s, o) => s + Math.min(o.me, o.friend), 0)) : null, [overlap]);

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
  const outgoing = friendRequests.outgoing.find((r) => r.user.id === f.id);
  const incoming = friendRequests.incoming.find((r) => r.user.id === f.id);
  const isFullView = !!f.recentRatings;
  const firstName = f.name.split(' ')[0];

  // statusBlock() in reference/app.js: Friends ✓ (inline remove confirm),
  // Request sent · cancel, Accept/Decline, or Add friend.
  const statusButton = isDemoAccountId(f.id) ? (
    <span className="tag">{t('friend.demoLabel')}</span>
  ) : isFriend ? (
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
    <button className="btn" onClick={() => addFriend(f.handle)}>{t('friend.addThem')}</button>
  );

  // "Say hi": there's no in-app messaging, so this hands a short greeting to
  // the system share sheet, or copies it for pasting into a chat.
  const sayHi = async () => {
    const text = t('friend.hiMessage', { name: firstName });
    if (typeof navigator !== 'undefined' && navigator.share) {
      try { await navigator.share({ text }); return; } catch { /* cancelled, fall through to copy */ }
    }
    try { await navigator.clipboard.writeText(text); showToast(t('friend.hiCopied')); }
    catch { showToast(text); }
  };

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
            <p className="muted">
              {f.handle}
              {isFriend && f.friendsSince ? ` · ${t('friend.friendsSince', { date: new Date(f.friendsSince).toLocaleDateString(toLocale(language), { month: 'long', year: 'numeric' }) })}` : ''}
            </p>
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
        <RecapOpenButton userId={f.id} label={t('friend.recapOf', { name: firstName })} />
        <BlendButton me={me.id} friend={f.id} friendName={firstName} matchPct={matchScore} />
        {isFriend && <button className="btn ghost" onClick={sayHi}>{t('friend.sayHi')}</button>}
      </div>

      {isFullView && shared.length > 0 && (
        <div className="stats3">
          <div className="tile t-pop"><span className="num">{shared.length}</span><small>{t('friend.sharedRatings')}</small></div>
          <div className="tile t-ac"><span className="num">{avgGap?.toFixed(1) ?? '—'}</span><small>{t('friend.avgGap')}</small></div>
          <div className="tile t-ink"><span className="num">{agreeCount}</span><small>{t('friend.youAgree')}</small></div>
        </div>
      )}

      <div className="bento b3">
        {isFullView && shared.length > 0 && (
          <div className="tile s2">
            <h3>{t('friend.bothLabel')}</h3>
            <div className="stack" style={{ marginTop: 10 }}>
              {biggestGap && <ScoreCompareRow albumId={biggestGap.albumId} mine={biggestGap.mine} theirs={biggestGap.theirs} friendName={firstName} highlight />}
              {shared.map((s) => <ScoreCompareRow key={s.albumId} albumId={s.albumId} mine={s.mine} theirs={s.theirs} friendName={firstName} />)}
            </div>
          </div>
        )}

        {matchHistory && matchHistory.length >= 2 && (
          <div className="tile t-soft2">
            <h3>{t('friend.matchTrend')}</h3>
            <MatchLine points={matchHistory.map((h) => h.pct)} />
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
              <div className="cmp" key={o.g}>
                <small style={{ fontWeight: 800 }}>{o.g}</small>
                <div className="cmpb"><i className="a" style={{ width: `${o.me}%` }} /><b>{o.me}%</b></div>
                <div className="cmpb"><i className="b" style={{ width: `${o.friend}%` }} /><b>{o.friend}%</b></div>
              </div>
            ))}
            <div className="acts" style={{ marginTop: 10 }}>
              <span><i className="lg1" />{t('friend.you')}</span>
              <span><i className="lg2" />{firstName}</span>
            </div>
          </div>
        )}

        {myStats && friendStats && (myStats.topArtists.length > 0 || friendStats.topArtists.length > 0) && (
          <div className="tile s2">
            <h3>{t('friend.topArtistsCompare')}</h3>
            <p className="muted" style={{ fontWeight: 600, margin: '-6px 0 10px' }}>{t('friend.topArtistsSubtitle', { name: firstName })}</p>
            <div className="two" style={{ marginTop: 10 }}>
              {[{ label: t('friend.you'), stats: myStats }, { label: firstName, stats: friendStats }].map(({ label, stats }, side) => {
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

        {isFullView && f.lastPlayed && (() => {
          const lp = f.lastPlayed;
          const a = lp.albumId ? liveAlbums[lp.albumId] || albums.find((x) => x.id === lp.albumId) : undefined;
          const cover = (a && (spotifyCovers[a.id] || a.cover)) || lp.cover || undefined;
          const live = !!f.nowPlaying;
          return (
            <button className="tile t-pop" onClick={() => a && openAlbum(a.id)} style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', textAlign: 'left', cursor: a ? 'pointer' : 'default' }}>
              <CoverArt url={cover} fallbackLetter={lp.artist[0] || '?'} className="cov" style={{ width: 72, height: 72 }} />
              <div>
                <small style={{ fontWeight: 800 }}>{live ? t('friend.listeningNow') : t('friend.lastPlayedAgo', { time: formatRelative(lp.startedAt, language) })}</small>
                <h3>{a?.title ?? lp.title}</h3>
                <p className="muted" style={{ fontWeight: 600 }}>{lp.artist}</p>
              </div>
            </button>
          );
        })()}

        {isFullView && (
          <div className="tile s2">
            <h3>{t('friend.top4')}</h3>
            <div style={{ marginTop: 10 }}><Top4Grid ids={f.top4Albums} /></div>
          </div>
        )}

        {isFullView && f.awards && (
          <div className="tile">
            <h3>{t('friend.awards')}</h3>
            <div className="chips" style={{ margin: 0 }}>
              {f.awards.length
                ? f.awards.map((aw) => <span className="chip on" key={aw.label}>{t(`groups.${aw.label}` as TranslationKey)} · {aw.detail}</span>)
                : <span className="muted" style={{ fontWeight: 600 }}>{t('friend.noAwards')}</span>}
            </div>
          </div>
        )}

        {!isFullView && (
          <div className="tile t-soft2">
            <p className="muted" style={{ fontWeight: 600 }}>{t('friend.reducedNote')}</p>
          </div>
        )}

        {isFullView && f.recentRatings && f.recentRatings.length > 0 && (
          <div className="tile s3">
            <h3>{t('friend.latestRatings')}</h3>
            <p className="muted" style={{ fontWeight: 600, margin: '-6px 0 8px' }}>{t('friend.latestRatingsSubtitle')}</p>
            <div className="stack" style={{ marginTop: 10 }}>
              {f.recentRatings.map((r) => <ScoreCompareRow key={r.albumId} albumId={r.albumId} mine={myScoreByAlbum.get(r.albumId) ?? null} theirs={r.stars} friendName={firstName} />)}
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
            <h3>{t('friend.friendsOf', { name: firstName })}</h3>
            <div className="stack" style={{ marginTop: 10 }}>
              {f.friends.length ? f.friends.map((u) => <FriendsOfFriendRow key={u.id} user={u} />) : <p className="muted">{t('friend.noFriends')}</p>}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
