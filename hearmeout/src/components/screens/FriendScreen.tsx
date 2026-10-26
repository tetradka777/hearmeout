'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ArtistAvatar, ArtistName } from '../ui/ArtistName';
import { useArtistPhoto } from '@/lib/artistPhotos';
import { blurStyle } from '@/lib/imageColor';
import { sizedImage } from '@/lib/imageSize';
import { AlbumShelfCard, Shelf } from '../ui/SuperCards';
import { PairTile } from '../ui/Podium';
import { fmt1 } from '@/lib/numberFormat';
import { useApp } from '@/lib/AppContext';
import type { ApiUser, Device, PublicProfile, StatsData } from '@/lib/types';
import { formatRelative, shortTitle, userAvatarStyle } from '@/lib/format';
import { computeMatch } from '@/lib/matchScore';
import { cachedJson, peekJson } from '@/lib/cachedJson';
import { CoverArt } from '../ui/CoverArt';
import { sinceLabel } from './GroupsScreen';
import { AwardGallery } from '../AwardGallery';
import { isDemoAccountId } from '@/lib/demoAccounts';
import { BlendButton } from '../BlendButton';
import { MascotIcon } from '../redesign/icons';
import { MATCH_FRIEND_EVENT } from '@/lib/uiEvents';
import { CoverWall, PersonCards, Phrase, toneColor, usePersonColor } from '../ui/Visual';
import { useFriendScores } from '@/lib/useFriendScores';
import { useAlbums } from '@/lib/useAlbum';

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
        <polyline points={xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')} fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
        {xy.map(([x, y], i) => <circle key={i} cx={x.toFixed(1)} cy={y.toFixed(1)} r={i === xy.length - 1 ? 5 : 3.5} fill="currentColor" />)}
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
  // Albums on the shelves that aren't in the catalog yet load in.
  useAlbums([...(f?.top4Albums ?? []), ...(f?.recentRatings ?? []).map((r) => r.albumId)]);

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
    <FriendHead f={f} demo={demo} isFriend={isFriend} firstName={firstName}>
      {statusButton}
      {isFriend && !f.locked && <button className="btn ghost" onClick={() => sendHi(f.id)}>{t('friend.sayHi')}</button>}
    </FriendHead>
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
  const albumOf = (id: string) => liveAlbums[id] || albums.find((x) => x.id === id);
  const coverOf = (id: string) => { const a = albumOf(id); return a ? spotifyCovers[a.id] || a.cover : undefined; };
  const gapCover = biggestGap ? coverOf(biggestGap.albumId) : undefined;
  const top4 = f.top4Albums.filter((id) => albumOf(id));
  const latest = isFullView ? [...f.recentRatings!].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 12) : [];
  const theirFriends = f.friends ? f.friends.filter((u) => u.id !== me.id && !me.friends.some((m) => m.id === u.id)) : [];

  return (
    <>
      {head}

      {/* The match: your colour flowing into theirs, the % big, how it moved,
          the numbers as pills and the ways to dig deeper. */}
      <PairHero me={me} friend={f}>
        <div className="fm20">
          <span className="duo" aria-hidden="true">
            <span className="avt" style={{ ...userAvatarStyle(me), backgroundSize: 'cover' }}>{!me.avatarUrl && me.name[0]?.toUpperCase()}</span>
            <span className="avt" style={{ ...userAvatarStyle(f), backgroundSize: 'cover' }}>{!f.avatarUrl && f.name[0]?.toUpperCase()}</span>
          </span>
          <b>{t('friend.youAnd', { name: firstName })}</b>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6 }}>
          <span className="num pct">{matchScore ?? '–'}</span>{matchScore != null && <span className="num pcts">%</span>}
        </div>
        <p style={{ fontWeight: 800, marginTop: 6 }}>{t('friend.matchScore')}</p>
        {snaps.length >= 2 && <MatchLine points={snaps} />}
        {shared.length > 0 && <Phrase parts={[[shared.length, t('friend.sharedRatings')], [avgGap != null ? fmt1(avgGap) : '–', t('friend.avgGap')], [agreeCount, t('friend.youAgree')]]} />}
        <div className="acts">
          <button className="btn" onClick={compare}>{t('friend.compare')}</button>
          <button className="btn ghost" onClick={() => openRecap(f.id)}>{t('friend.recapOf', { name: firstName })}</button>
          <BlendButton me={me.id} friend={f.id} friendName={firstName} matchPct={matchScore} className="btn ghost" />
        </div>
      </PairHero>

      {/* What they play now (or last), over its blurred cover. */}
      {lp && (() => {
        const a = lp.albumId ? albumOf(lp.albumId) : undefined;
        const cover = (a && (spotifyCovers[a.id] || a.cover)) || lp.cover || undefined;
        return (
          <button className="tile bh15 lp20" style={blurStyle(cover ? sizedImage(cover, 150) ?? cover : null)} onClick={() => a && openAlbum(a.id)} disabled={!a}>
            <CoverArt url={cover} fallbackLetter={lp.artist[0] || '?'} className="cov" px={180} style={{ width: 96, height: 96, flex: 'none' }} />
            <span className="g">
              <small>
                {f.nowPlaying && <span className="eqs"><span className="eq"><b /><b /><b /></span></span>}
                {f.nowPlaying ? t('friend.listeningNow') : t('friend.lastPlayedAgo', { time: formatRelative(lp.startedAt, language) })}
              </small>
              <b className="tt">{shortTitle(lp.title)}</b>
              <small className="ar2"><ArtistName name={lp.artist} albumId={lp.albumId} size={18} /></small>
              {a && a.title !== lp.title && <small>{a.title}</small>}
            </span>
          </button>
        );
      })()}

      {top4.length > 0 && (
        <Shelf title={t('friend.top4', { name: firstName })}>
          {top4.map((id) => {
            const a = albumOf(id)!;
            return <AlbumShelfCard key={id} cover={coverOf(id)} title={a.title} artist={a.artist} artistId={a.artistId} badge={theirScoreByAlbum.has(id) ? fmt1(theirScoreByAlbum.get(id)!) : undefined} onClick={() => openAlbum(id)} />;
          })}
        </Shelf>
      )}

      {/* Taste side by side: genres on your two colours, artists over the
          photo of the first one. */}
      <div className="sec two">
        {overlap.length > 0 && f.genres.length > 0 && me.genres.length > 0 && (
          <PairTile a={me} b={f}>
            <h2>{t('friend.genreOverlap')}</h2>
            <p className="du20h"><span className="num">{sharedGenrePct}%</span> {t('friend.sharedLabel')}</p>
            <Duel you={t('friend.youLower')} them={firstName} rows={overlap.map((o) => ({ key: o.g, label: <b>{o.g}</b>, a: o.me, b: o.friend, av: `${o.me}%`, bv: `${o.friend}%` }))} max={Math.max(1, ...overlap.flatMap((o) => [o.me, o.friend]))} />
          </PairTile>
        )}
        {artistRows.some((r) => r.them > 0) && (
          <ArtistsDuel rows={artistRows} max={maxHours} you={t('friend.youLower')} them={firstName} title={t('friend.topArtistsCompare')} unit={t('unit.h')} onOpen={(r) => r.id && openSpotifyArtist(r.id, r.name)} />
        )}
      </div>

      {/* Albums you both rated, over the cover of the one you split on most. */}
      {shared.length > 0 && (
        <div className="tile bh15 bs20" style={blurStyle(gapCover ? sizedImage(gapCover, 150) ?? gapCover : null)}>
          <h2>{t('friend.bothLabel')}</h2>
          <CoverWall row items={[
            ...(biggestGap ? [{ ...wall(biggestGap.albumId, `${t('friend.you')} ${fmt1(biggestGap.mine)} · ${firstName} ${fmt1(biggestGap.theirs)}`, fmt1(biggestGap.theirs)), key: 'gap', title: t('friend.biggestGap') }] : []),
            ...shared.filter((x) => x.albumId !== biggestGap?.albumId).map((x) => wall(x.albumId, `${t('friend.you')} ${fmt1(x.mine)} · ${firstName} ${fmt1(x.theirs)}`, fmt1(x.theirs))),
          ]} />
        </div>
      )}

      {latest.length > 0 && (
        <Shelf title={t('friend.latestRatings')}>
          {latest.map((r) => {
            const a = albumOf(r.albumId);
            return (
              <AlbumShelfCard
                key={r.albumId}
                cover={coverOf(r.albumId)}
                title={a?.title ?? '…'}
                artist={a?.artist ?? ''}
                artistId={a?.artistId}
                badge={fmt1(r.stars)}
                meta={myScoreByAlbum.has(r.albumId) ? `${t('friend.you')} ${fmt1(myScoreByAlbum.get(r.albumId)!)}` : undefined}
                onClick={() => openAlbum(r.albumId)}
              />
            );
          })}
        </Shelf>
      )}

      {!!f.awards?.length && (
        <section className="sh14">
          <div className="hd"><h2>{t('friend.awards')}</h2></div>
          <AwardGallery earned={f.awards.map((aw) => aw.label)} />
        </section>
      )}

      {mutualFriends.length > 0 && (
        <section className="sh14">
          <div className="hd"><h2>{t('friend.mutualFriends')}</h2></div>
          <PersonCards people={mutualFriends.map((u) => ({ id: u.id, name: u.name, avatarUrl: u.avatarUrl, onClick: () => viewFriend(u.id), value: myFriendScores[u.id]?.pct != null ? `${myFriendScores[u.id]!.pct}%` : undefined }))} />
        </section>
      )}

      {theirFriends.length > 0 && (
        <section className="sh14">
          <div className="hd"><h2>{t('friend.friendsOf', { name: firstName })}</h2></div>
          <PersonCards people={theirFriends.map((u) => ({ id: u.id, name: u.name, avatarUrl: u.avatarUrl, sub: `@${u.handle.replace(/^@/, '')}`, onClick: () => viewFriend(u.id), action: <FriendButton user={u} /> }))} />
        </section>
      )}
    </>
  );
}

// The header in the person's own colour (like your profile): photo, name,
// handle, what they play now, the friendship buttons and their numbers.
function FriendHead({ f, demo, isFriend, firstName: _firstName, children }: { f: PublicProfile; demo: boolean; isFriend: boolean; firstName: string; children: ReactNode }) {
  const { t, language } = useApp();
  const color = usePersonColor(f);
  const counts: [string, string][] = f.locked ? [] : [
    [String(f.stats.ratings), t('profile.ratingsL', { n: f.stats.ratings })],
    [fmt1(f.stats.avg), t('profile.avgScoreL')],
    [String(f.stats.reviews), t('profile.reviewsL', { n: f.stats.reviews })],
    ...(f.friends ? [[String(f.friends.length), t('profile.friendsL', { n: f.friends.length })] as [string, string]] : []),
  ];
  return (
    <div className="phd14 ph16 fh20" style={{ ['--g1' as string]: color, ['--a1' as string]: f.avatarUrl ? `url('${f.avatarUrl}')` : 'none' } as CSSProperties}>
      <span className="avt lgA" style={{ ...userAvatarStyle(f), backgroundSize: 'cover' }}>{!f.avatarUrl && f.name[0].toUpperCase()}</span>
      <div className="pinfo">
        <small className="ey">
          {isFriend ? t('friend.eyebrowFriend') : t('friend.eyebrowPerson')}
          {demo && <> · <span className="tag">{t('friends.demoTag')}</span></>}
        </small>
        <h1 className="pname">{f.name}</h1>
        <p className="ploc">
          @{f.handle.replace(/^@/, '')}
          {isFriend && f.friendsSince ? ` · ${t('friend.friendsSince', { date: sinceLabel(f.friendsSince, language) })}` : ''}
        </p>
        {!f.locked && f.nowPlaying && (
          <p className="nowl"><span className="eqs"><span className="eq"><b /><b /><b /></span></span> {t('friend.nowPlaying', { title: f.nowPlaying.title, artist: f.nowPlaying.artist })}</p>
        )}
      </div>
      <div className="pbt14">{children}</div>
      {counts.length > 0 && (
        <div className="pcnt">
          {counts.map(([v, l]) => <div key={l}><span className="num">{v}</span><small>{l}</small></div>)}
        </div>
      )}
    </div>
  );
}

// The match card: your colour on the left into theirs on the right, both
// photos blurred behind (the same card as on Match).
function PairHero({ me, friend, children }: { me: ApiUser; friend: ApiUser; children: ReactNode }) {
  const mine = usePersonColor(me);
  const theirs = usePersonColor(friend);
  const right = theirs === mine ? toneColor(`${friend.id}~`) : theirs;
  const style = {
    ['--g1' as string]: mine, ['--g2' as string]: right,
    ['--a1' as string]: me.avatarUrl ? `url('${me.avatarUrl}')` : 'none',
    ['--a2' as string]: friend.avatarUrl ? `url('${friend.avatarUrl}')` : 'none',
  } as CSSProperties;
  return <div className="tile mh16 fmh20" style={style}>{children}</div>;
}

type DuelRow = { key: string; label: ReactNode; a: number; b: number; av: string; bv: string; onClick?: () => void };

// Two people side by side: for each row your bar grows left from the
// middle, theirs right, the values at the ends.
function Duel({ rows, max, you, them }: { rows: DuelRow[]; max: number; you: string; them: string }) {
  return (
    <div className="du20">
      <div className="lgd"><span><i className="a" />{you}</span><span>{them}<i className="b" /></span></div>
      {rows.map((r, i) => {
        const body = (
          <>
            <span className="lb">{r.label}</span>
            <small className="va">{r.av}</small>
            <span className="ba"><i style={{ width: `${Math.round((r.a / max) * 100)}%`, ['--d' as string]: `${i * 70}ms` } as CSSProperties} /></span>
            <span className="bb"><i style={{ width: `${Math.round((r.b / max) * 100)}%`, ['--d' as string]: `${i * 70}ms` } as CSSProperties} /></span>
            <small className="vb">{r.bv}</small>
          </>
        );
        return r.onClick
          ? <button key={r.key} className="r" onClick={r.onClick}>{body}</button>
          : <div key={r.key} className="r">{body}</div>;
      })}
    </div>
  );
}

// Top artists as a duel over the blurred photo of the first one.
function ArtistsDuel({ rows, max, you, them, title, unit, onOpen }: {
  rows: { name: string; id: string | null; me: number; them: number }[]; max: number; you: string; them: string; title: string; unit: string;
  onOpen: (r: { name: string; id: string | null }) => void;
}) {
  const photo = useArtistPhoto(rows[0]?.name ?? '', !!rows[0], rows[0]?.id);
  return (
    <div className="tile bh15" style={blurStyle(photo ? sizedImage(photo, 150) ?? photo : null)}>
      <h2>{title}</h2>
      <Duel you={you} them={them} max={max} rows={rows.map((r) => ({
        key: r.name,
        label: <><ArtistAvatar name={r.name} id={r.id} size={26} /><b>{r.name}</b></>,
        a: r.me, b: r.them, av: `${r.me}${unit}`, bv: `${r.them}${unit}`,
        onClick: r.id ? () => onOpen(r) : undefined,
      }))} />
    </div>
  );
}
