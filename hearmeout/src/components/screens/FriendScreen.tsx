'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArtistName } from '../ui/ArtistName';
import { fmt1 } from '@/lib/numberFormat';
import { useApp } from '@/lib/AppContext';
import type { ApiUser, Device, PublicProfile, StatsData } from '@/lib/types';
import { formatRelative, userAvatarStyle } from '@/lib/format';
import { computeMatch } from '@/lib/matchScore';
import { cachedJson, peekJson } from '@/lib/cachedJson';
import { CoverArt } from '../ui/CoverArt';
import { pluralForKey } from '@/lib/i18n';
import { sinceLabel } from './GroupsScreen';
import { AwardGallery } from '../AwardGallery';
import { isDemoAccountId } from '@/lib/demoAccounts';
import { BlendButton } from '../BlendButton';
import { MascotIcon } from '../redesign/icons';
import { MATCH_FRIEND_EVENT } from '@/lib/uiEvents';
import { CoverWall, PersonCards, Phrase } from '../ui/Visual';
import { useFriendScores } from '@/lib/useFriendScores';

function Top4Tile({ ids, scores }: { ids: string[]; scores: Map<string, number> }) {
  const { t, albums, liveAlbums, spotifyCovers, openAlbum } = useApp();
  const shown = ids.map((id) => ({ id, a: liveAlbums[id] || albums.find((x) => x.id === id) })).filter((x) => x.a);
  if (!shown.length) return <p className="muted" style={{ fontWeight: 600 }}>{t('profile.noRatingsYet')}</p>;
  return (
    <div className="t4">
      {shown.map(({ id, a }) => (
        <button key={id} onClick={() => openAlbum(id)} style={{ textAlign: 'left', color: 'inherit' }}>
          <div className="cvw">
            <CoverArt url={spotifyCovers[a!.id] || a!.cover} fallbackLetter={a!.artist[0] || '?'} className="cov" px={170} style={{ width: '100%', aspectRatio: '1' }} />
            {scores.has(id) && <span className="bdg">{fmt1(scores.get(id)!)}</span>}
          </div>
          <b style={{ display: 'block', marginTop: 8, fontSize: 14 }}>{a!.title}</b>
        </button>
      ))}
    </div>
  );
}

// The relationship button under a person card (friendBtn(n, true)).
function FriendButton({ user }: { user: ApiUser }) {
  const { t, me, friendRequests, addFriend, respondToFriendRequest } = useApp();
  if (!me || user.id === me.id) return null;
  const out = friendRequests.outgoing.find((r) => r.user.id === user.id);
  const inc = friendRequests.incoming.find((r) => r.user.id === user.id);
  return me.friends.some((f) => f.id === user.id) ? <span className="tag" style={{ alignSelf: 'center' }}>{t('friend.friendsTag')}</span>
    : out ? <button className="btn ghost" onClick={() => respondToFriendRequest(out.id, 'cancel')}>{t('friend.requestSent')}</button>
    : inc ? <button className="btn" onClick={() => respondToFriendRequest(inc.id, 'accept')}>{t('friends.accept')}</button>
    : <button className="btn" onClick={() => addFriend(user.handle)}>{t('friend.addFriend')}</button>;
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
    setConfirmRemove(false);
    // Loaded once per open (audit D3: it used to re-fetch every 30s and post
    // a match snapshot each time). A profile the preloader already fetched
    // (lib/cachedJson) shows at once while the fresh one loads.
    const url = `/api/users/${state.viewingUserId}`;
    const stored = peekJson<PublicProfile>(url);
    setF(stored);
    setLoading(!stored);
    cachedJson<PublicProfile>(url).then((data) => { if (!cancelled) { if (data || !stored) setF(data); setLoading(false); } });
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
    const url = `/api/match/${f.id}/history`;
    setMatchHistory(peekJson<{ history: { pct: number; date: string }[] }>(url)?.history ?? null);
    cachedJson<{ history: { pct: number; date: string }[] }>(url).then((d) => { if (!cancelled) setMatchHistory(d?.history ?? []); });
    return () => { cancelled = true; };
  }, [f?.id, f?.locked]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!f || f.locked) { setMyStats(null); setFriendStats(null); return; }
    let cancelled = false;
    setMyStats(peekJson<StatsData>('/api/stats?range=6m'));
    setFriendStats(peekJson<StatsData>(`/api/stats?range=6m&userId=${f.id}`));
    Promise.all([
      cachedJson<StatsData>('/api/stats?range=6m'),
      cachedJson<StatsData>(`/api/stats?range=6m&userId=${f.id}`),
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
  const wall = (albumId: string, sub: string | undefined, badge: string) => {
    const a = liveAlbums[albumId] || albums.find((x) => x.id === albumId);
    return { key: albumId, cover: a ? spotifyCovers[a.id] || a.cover : undefined, title: a?.title ?? albumId, artist: a?.artist, artistId: a?.artistId, sub, badge, onClick: () => openAlbum(albumId) };
  };
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
      <button className="btn ghost" onClick={() => setConfirmRemove(true)}>{t('friend.friendsCheck')} <i className="ic ic-check" /></button>
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
          {isFriend && f.friendsSince ? ` · ${t('friend.friendsSince', { date: sinceLabel(f.friendsSince, language) })}` : ''}
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
        {/* Rev 9: who you have in common, what opens up after they accept, and a blurred preview. */}
        <div className="bento b3" style={{ marginTop: 14 }}>
          {f.mutualFriends && f.mutualFriends.length > 0 && (
            <div className="tile t-pop">
              <small className="k9">{t('friend.youAnd', { name: f.name })}</small>
              <h3 style={{ margin: '2px 0 8px' }}>{t('friend.mutualN', { n: f.mutualFriends.length })}</h3>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {f.mutualFriends.map((m) => (
                  <button className="chip" key={m.id} onClick={() => viewFriend(m.id)}><span className="dot" style={userAvatarStyle(m)}>{!m.avatarUrl && m.name[0]}</span>{m.name}</button>
                ))}
              </div>
            </div>
          )}
          <div className={`tile t-soft2 ${f.mutualFriends && f.mutualFriends.length > 0 ? 's2' : 's3'}`}>
            <small className="k9 muted">{t('friend.afterAccept')}</small>
            <h3 style={{ margin: '2px 0 10px' }}>{t('friend.whatYouWillSee')}</h3>
            <div className="chips" style={{ margin: 0 }}>
              {(['friend.unlockRatings', 'friend.unlockMatch', 'friend.unlockTop4', 'friend.unlockArtists', 'friend.unlockRecap', 'friend.unlockAwards'] as const).map((k) => <span className="chip" key={k}>{t(k)}</span>)}
            </div>
            <p className="muted" style={{ fontWeight: 600, marginTop: 12 }}>{t('friend.lockedHint', { name: f.name })}</p>
          </div>
          <div className="locked9 s3">
            <div className="lkgrid9" aria-hidden="true">
              {[70, 55, 65].map((w, i) => (
                <div className="tile lk9" key={i}>
                  <span className="sk" style={{ height: 12, width: `${w}%` }} />
                  <span className="sk" style={{ height: 12, width: `${w - 20}%` }} />
                  <span className="sk" style={{ height: 40, width: '100%' }} />
                </div>
              ))}
            </div>
            <div className="lkbadge9"><span aria-hidden="true"><i className="ic ic-lock" /></span>{t('friend.closedProfileTitle')}<small>{t('friend.sendRequestToUnlock')}</small></div>
          </div>
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

      <Phrase parts={[[shared.length, t('friend.sharedRatings')], [avgGap != null ? fmt1(avgGap) : '–', t('friend.avgGap')], [agreeCount, t('friend.youAgree')]]} />

      <div className="bento b3">
        <div className="tile s2">
          <h2>{t('friend.bothLabel')}</h2>
          {biggestGap || shared.length ? (
            <CoverWall items={[
              ...(biggestGap ? [{ ...wall(biggestGap.albumId, `${t('friend.you')} ${fmt1(biggestGap.mine)} · ${firstName} ${fmt1(biggestGap.theirs)}`, fmt1(biggestGap.theirs)), key: 'gap', title: t('friend.biggestGap') }] : []),
              ...shared.map((x) => wall(x.albumId, `${t('friend.you')} ${fmt1(x.mine)} · ${firstName} ${fmt1(x.theirs)}`, fmt1(x.theirs))),
            ]} />
          ) : <p className="muted" style={{ fontWeight: 600 }}>{isFullView ? t('friend.noSharedYet') : t('friend.reducedNote')}</p>}
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
              <small style={{ fontWeight: 800, display: 'block' }}><ArtistName name={r.name} id={r.id} size={22} /></small>
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
                <p className="muted" style={{ fontWeight: 600 }}><ArtistName name={lp.artist} size={18} /></p>
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
          <div>
            {f.awards?.length
              ? <AwardGallery earned={f.awards.map((aw) => aw.label)} />
              : <span className="muted" style={{ fontWeight: 600 }}>{t('friend.noAwards')}</span>}
          </div>
        </div>

        {isFullView && (
          <div className="tile s3">
            <h2>{t('friend.latestRatings')}</h2>
            <p className="muted" style={{ fontWeight: 600, margin: '-6px 0 8px' }}>{t('friend.latestRatingsSubtitle')}</p>
            {f.recentRatings!.length
              ? <CoverWall items={[...f.recentRatings!].sort((a, b) => b.stars - a.stars).slice(0, 12).map((r) => wall(r.albumId, myScoreByAlbum.has(r.albumId) ? `${t('friend.you')} ${fmt1(myScoreByAlbum.get(r.albumId)!)}` : undefined, fmt1(r.stars)))} />
              : <p className="muted" style={{ fontWeight: 600 }}>{t('profile.noRatingsYet')}</p>}
          </div>
        )}

        <div className="tile">
          <h2>{t('friend.mutualFriends')}</h2>
          {mutualFriends.length ? (
            <PersonCards people={mutualFriends.map((u) => ({ id: u.id, name: u.name, avatarUrl: u.avatarUrl, onClick: () => viewFriend(u.id), value: myFriendScores[u.id]?.pct != null ? `${myFriendScores[u.id]!.pct}%` : undefined }))} />
          ) : <p className="muted" style={{ fontWeight: 600 }}>{t('friend.noMutual')}</p>}
        </div>

        {f.friends && (
          <div className="tile s2">
            <h2>{t('friend.friendsOf', { name: firstName })}</h2>
            <p className="muted" style={{ fontWeight: 600, margin: '-6px 0 8px' }}>{t('friend.friendsOfSub', { name: firstName })}</p>
            {f.friends.filter((u) => u.id !== me.id && !me.friends.some((m) => m.id === u.id)).length
              ? <PersonCards people={f.friends.filter((u) => u.id !== me.id && !me.friends.some((m) => m.id === u.id)).map((u) => ({ id: u.id, name: u.name, avatarUrl: u.avatarUrl, sub: `@${u.handle.replace(/^@/, '')}`, onClick: () => viewFriend(u.id), action: <FriendButton user={u} /> }))} />
              : <p className="muted" style={{ fontWeight: 600 }}>{t('friend.noFriends')}</p>}
          </div>
        )}
      </div>
    </>
  );
}
