'use client';

import { useEffect, useMemo, useState } from 'react';
import { fmt1 } from '@/lib/numberFormat';
import { PROFILE_TAB_EVENT } from '../redesign/AvatarMenu';
import { useApp } from '@/lib/AppContext';
import { invitePath } from '@/lib/pendingInvite';
import type { Device, RatingRecord } from '@/lib/types';
import { userAvatarStyle, formatJoinDate, formatRelative } from '@/lib/format';
import { toLocale, quoted } from '@/lib/i18n';
import { LovedTracksColumn, LovedAlbumsColumn, LovedArtistsColumn } from '../ProfileBlocks';
import { CoverArt } from '../ui/CoverArt';
import { Stars } from '../redesign/Stars';
import { MascotIcon } from '../redesign/icons';
import { useFriendScores } from '@/lib/useFriendScores';
import type { TranslationKey } from '@/lib/i18n';
import { LaterRow, useLaterPlay } from './LaterScreen';
import { RegionInput } from '../RegionInput';
import { Initial } from '../ui/Initial';

type ProfileTab = 'ratings' | 'reviews' | 'loved' | 'later' | 'taste' | 'awards' | 'listening' | 'friends';
const TAB_ORDER: ProfileTab[] = ['ratings', 'reviews', 'loved', 'later', 'taste', 'awards', 'listening', 'friends'];
const TAB_KEY: Record<ProfileTab, TranslationKey> = {
  ratings: 'profile.tabRatings', reviews: 'profile.tabReviews', loved: 'profile.tabLoved', later: 'profile.tabLater',
  taste: 'profile.tabTaste', awards: 'profile.tabAwards', listening: 'profile.tabListening', friends: 'profile.tabFriends',
};

function useAlbumOf() {
  const { albums, liveAlbums, spotifyCovers } = useApp();
  return (id: string) => {
    const a = liveAlbums[id] || albums.find((x) => x.id === id);
    return { title: a?.title ?? id, artist: a?.artist ?? '', genre: a?.genreBucket || a?.genre || '', cover: a ? spotifyCovers[a.id] || a.cover : undefined };
  };
}

// vProfile()'s rating row: cover 48, title, "artist · date", stars, big score.
function RatingRow({ r }: { r: RatingRecord }) {
  const { language, openAlbum } = useApp();
  const a = useAlbumOf()(r.albumId);
  return (
    <button className="row" onClick={() => openAlbum(r.albumId)}>
      <CoverArt url={a.cover} fallbackLetter={a.artist[0] || '?'} className="cov" style={{ width: 48, height: 48 }} />
      <span className="g">
        <b>{a.title}</b>
        <small className="muted" style={{ fontWeight: 600 }}>{a.artist}{a.artist ? ' · ' : ''}{new Date(r.createdAt).toLocaleDateString(toLocale(language), { day: '2-digit', month: 'short' })}</small>
      </span>
      <span className="stars"><Stars value={r.stars} size={14} /></span>
      <span className="num" style={{ fontSize: 26, width: 44, textAlign: 'right' }}>{fmt1(r.stars)}</span>
    </button>
  );
}

function EmptyTile({ title, body, children, plain }: { title: string; body: string; children?: React.ReactNode; plain?: boolean }) {
  return (
    <div className={plain ? 'empty' : 'tile t-soft2 empty'} style={plain ? { padding: 10 } : undefined}>
      <MascotIcon />
      <h3>{title}</h3>
      <p className="muted" style={{ fontWeight: 600 }}>{body}</p>
      {children}
    </div>
  );
}

function RatingsTab({ list, avg, reviews }: { list: RatingRecord[]; avg: number; reviews: number }) {
  const { t, viewHistory } = useApp();
  return (
    <>
      <div className="tile t-pop" style={{ display: 'flex', gap: 16, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <small style={{ fontWeight: 800 }}>{t('profile.yourRatings')}</small>
          <div className="vsline">
            <div><span className="num" style={{ fontSize: 44 }}>{list.length}</span><br /><small style={{ fontWeight: 700 }}>{t('profile.albumsL')}</small></div>
            <div><span className="num" style={{ fontSize: 44 }}>{fmt1(avg)}</span><br /><small style={{ fontWeight: 700 }}>{t('profile.averageL')}</small></div>
            <div><span className="num" style={{ fontSize: 44 }}>{reviews}</span><br /><small style={{ fontWeight: 700 }}>{t('profile.reviewsL')}</small></div>
          </div>
        </div>
        <button className="btn lg" onClick={() => viewHistory('profile')}>{t('profile.openHistoryStats')} →</button>
      </div>
      <div className="tile">
        {list.length ? list.slice(0, 6).map((r) => <RatingRow key={r.albumId} r={r} />) : <p className="muted" style={{ fontWeight: 600 }}>{t('profile.noRatingsYet')}</p>}
        {list.length > 0 && <div className="acts"><button className="btn ghost" onClick={() => viewHistory('profile')}>{t('profile.seeAllRatings', { count: list.length })}</button></div>}
      </div>
    </>
  );
}

function ReviewsTab({ list }: { list: RatingRecord[] }) {
  const { t, language, openAlbum } = useApp();
  const albumOf = useAlbumOf();
  const rv = list.filter((r) => !!r.review);
  if (!rv.length) return <div className="stack"><EmptyTile title={t('profile.noReviewsTitle')} body={t('profile.noReviewsBody')} /></div>;
  return (
    <div className="stack">
      {rv.map((r, i) => {
        const a = albumOf(r.albumId);
        return (
          <div className={`tile${i % 2 ? '' : ' t-soft2'}`} key={r.albumId}>
            <button style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 10, textAlign: 'left', color: 'inherit' }} onClick={() => openAlbum(r.albumId)}>
              <CoverArt url={a.cover} fallbackLetter={a.artist[0] || '?'} className="cov" style={{ width: 48, height: 48 }} />
              <div><b>{a.title}</b><br /><span className="stars"><Stars value={r.stars} size={14} /></span></div>
            </button>
            <p className="quote" style={{ fontSize: 19 }}>{quoted(language, r.review ?? '')}</p>
          </div>
        );
      })}
    </div>
  );
}

function LovedTab() {
  const { t, lovedItems, showToast } = useApp();
  const shareable = lovedItems.filter((li) => li.type === 'track');
  const share = () => {
    if (!shareable.length) { showToast(t('profile.lovedEmptyTrack')); return; }
    const lines = shareable.map((li, i) => `${i + 1}. ${li.title} — ${li.artist}${li.itemId ? `\nhttps://open.spotify.com/track/${li.itemId}` : ''}`);
    const block = `${t('profile.lovedTracksShareHeader')}\n\n${lines.join('\n\n')}`;
    try {
      navigator.clipboard.writeText(block).then(() => showToast(t('profile.lovedTracksShareCopied')), () => showToast(block));
    } catch {
      showToast(block);
    }
  };
  return (
    <>
      <div className="acts" style={{ margin: '0 0 14px' }}><button className="btn" onClick={share}>{t('profile.shareLovedTracks')}</button></div>
      <div className="bento b3">
        <div className="tile"><h2>{t('profile.lovedTracksTitle')}</h2><LovedTracksColumn /></div>
        <div className="tile t-soft2"><h2>{t('profile.lovedAlbumsTitle')}</h2><LovedAlbumsColumn /></div>
        <div className="tile"><h2>{t('profile.lovedArtistsTitle')}</h2><LovedArtistsColumn /></div>
      </div>
    </>
  );
}

function LaterTab() {
  const { t, laterItems, showScreen } = useApp();
  const play = useLaterPlay();
  const sorted = [...laterItems].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return (
    <>
      <div className="tile t-pop" style={{ display: 'flex', gap: 16, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <small style={{ fontWeight: 800 }}>{t('later.eyebrow')}</small>
          <div className="vsline">
            <div><span className="num" style={{ fontSize: 44 }}>{laterItems.filter((x) => x.type === 'album').length}</span><br /><small style={{ fontWeight: 700 }}>{t('later.albumMany')}</small></div>
            <div><span className="num" style={{ fontSize: 44 }}>{laterItems.filter((x) => x.type === 'track').length}</span><br /><small style={{ fontWeight: 700 }}>{t('later.trackMany')}</small></div>
          </div>
        </div>
        <button className="btn lg" onClick={() => showScreen('later')}>{t('later.openLater')} →</button>
      </div>
      {sorted.length ? (
        <div className="tile">{sorted.slice(0, 5).map((item) => <LaterRow key={item.id} item={item} onPlay={play} />)}</div>
      ) : (
        <EmptyTile title={t('later.emptyTitle')} body={t('profile.laterEmptyBody')} />
      )}
    </>
  );
}

function TasteTab({ list }: { list: RatingRecord[] }) {
  const { t, me, openAlbum } = useApp();
  const albumOf = useAlbumOf();
  const fp = useMemo(() => {
    const g = new Map<string, number[]>();
    for (const r of list) {
      const k = albumOf(r.albumId).genre;
      if (!k) continue;
      g.set(k, [...(g.get(k) || []), r.stars]);
    }
    return [...g.entries()].map(([k, v]) => ({ g: k, avg: v.reduce((a, b) => a + b, 0) / v.length, n: v.length })).sort((a, b) => b.avg - a.avg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list]);
  const top4 = [...list].sort((a, b) => b.stars - a.stars).slice(0, 4);
  const genres = me?.genres ?? [];
  const maxPct = Math.max(1, ...genres.map((g) => g.pct));
  return (
    <div className="bento b3">
      <div className="tile s2">
        <h2>{t('profile.taste')}</h2>
        <p className="muted" style={{ fontWeight: 600, margin: '-6px 0 12px' }}>{t('profile.tasteFingerprintSubtitle')}</p>
        {fp.length ? (
          <div className="fp">
            {fp.map((x) => (
              <div className="fpc" key={x.g}>
                <b>{x.g}</b>
                <span className="num">{fmt1(x.avg)}</span>
                <div className="meter"><i style={{ width: `${Math.round((x.avg / 5) * 100)}%` }} /></div>
                <small className="muted" style={{ fontWeight: 700 }}>{t(x.n === 1 ? 'profile.albumCountOne' : 'profile.albumCountMany', { n: x.n })}</small>
              </div>
            ))}
          </div>
        ) : <p className="muted" style={{ fontWeight: 600 }}>{t('profile.fingerprintEmpty')}</p>}
      </div>
      <div className="tile">
        <h2>{t('profile.favoriteGenres')}</h2>
        <p className="muted" style={{ fontWeight: 600, margin: '-6px 0 12px' }}>{t('profile.favoriteGenresSubtitle')}</p>
        {genres.length ? genres.slice(0, 4).map((g) => (
          <div className="cmp" key={g.g}>
            <small style={{ fontWeight: 800 }}>{g.g} · {g.pct}%</small>
            <div className="cmpb"><i className="a" style={{ width: `${Math.round((g.pct / maxPct) * 100)}%`, background: 'var(--acct)' }} /></div>
          </div>
        )) : <p className="muted" style={{ fontWeight: 600 }}>{t('profile.notEnoughData')}</p>}
      </div>
      <div className="tile s3">
        <h2>{t('profile.top4')}</h2>
        {top4.length ? (
          <div className="t4">
            {top4.map((r) => {
              const a = albumOf(r.albumId);
              return (
                <button key={r.albumId} onClick={() => openAlbum(r.albumId)} style={{ textAlign: 'left', color: 'inherit' }}>
                  <div className="cvw">
                    <CoverArt url={a.cover} fallbackLetter={a.artist[0] || '?'} className="cov" style={{ width: '100%', aspectRatio: '1' }} />
                    <span className="bdg">{fmt1(r.stars)}</span>
                  </div>
                  <b style={{ display: 'block', marginTop: 8, fontSize: 14 }}>{a.title}</b>
                </button>
              );
            })}
          </div>
        ) : <p className="muted" style={{ fontWeight: 600 }}>{t('profile.noRatingsYet')}</p>}
      </div>
    </div>
  );
}

type Person = { id: string; name: string; avatarUrl: string | null };
type Monthly = { mine: string[]; minutes: (Person & { v: number }) | null; niche: (Person & { v: number }) | null };

function AwardsTab({ onGoToFriends }: { onGoToFriends: () => void }) {
  const { t, me } = useApp();
  const [data, setData] = useState<Monthly | null>(null);
  const groupKey = me ? [me.id, ...me.friends.map((f) => f.id)].join(',') : '';

  useEffect(() => {
    if (!me) return;
    let cancelled = false;
    const people: Person[] = [{ id: me.id, name: me.name, avatarUrl: me.avatarUrl }, ...me.friends.map((f) => ({ id: f.id, name: f.name, avatarUrl: f.avatarUrl }))];
    Promise.all(people.map(async (p) => {
      const res = await fetch(`/api/recap?period=month&userId=${p.id}`);
      if (!res.ok) return null;
      const d = await res.json();
      return { ...p, minutes: d.minutes as number, artists: d.uniqueArtists as number, awards: (d.awards || []) as string[] };
    })).then((rows) => {
      if (cancelled) return;
      const valid = rows.filter((r): r is NonNullable<typeof r> => !!r);
      const active = valid.filter((r) => r.minutes > 0);
      const byMin = [...active].sort((a, b) => b.minutes - a.minutes)[0];
      const byNiche = [...active].sort((a, b) => b.artists - a.artists)[0];
      setData({
        mine: valid.find((r) => r.id === me.id)?.awards ?? [],
        minutes: me.friends.length && byMin ? { ...byMin, v: Math.round(byMin.minutes / 60) } : null,
        niche: me.friends.length && byNiche ? { ...byNiche, v: byNiche.artists } : null,
      });
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupKey]);

  if (!me) return null;
  const who = (p: Person) => (p.id === me.id ? t('profile.you') : p.name);
  return (
    <div className="bento b3">
      <div className="tile">
        <h2>{t('profile.yourAwards')}</h2>
        <div className="chips" style={{ margin: 0 }}>
          {data === null ? <span className="muted">{t('awards.computing')}</span>
            : data.mine.length ? data.mine.map((a) => <span className="chip on" key={a}>{t(`groups.${a}` as TranslationKey)}</span>)
            : <span className="muted" style={{ fontWeight: 600 }}>{t('recap.noAwards')}</span>}
        </div>
      </div>
      <div className="tile s2 t-soft2">
        <h2>{t('profile.monthAwards')}</h2>
        {data && data.minutes && data.niche ? (
          <>
            <div className="row">
              <span className="dot" style={userAvatarStyle(data.minutes)}>{!data.minutes.avatarUrl && data.minutes.name[0]}</span>
              <span className="g"><b>{t('awards.mostMinutes')}</b><small className="muted" style={{ fontWeight: 600 }}>{who(data.minutes)} · {t('profile.hoursN', { n: data.minutes.v })}</small></span>
            </div>
            <div className="row">
              <span className="dot" style={userAvatarStyle(data.niche)}>{!data.niche.avatarUrl && data.niche.name[0]}</span>
              <span className="g"><b>{t('awards.mostNiche')}</b><small className="muted" style={{ fontWeight: 600 }}>{who(data.niche)} · {t('profile.uniqueArtistsN', { n: data.niche.v })}</small></span>
            </div>
          </>
        ) : data === null && me.friends.length ? (
          <p className="muted">{t('awards.computing')}</p>
        ) : (
          <EmptyTile plain title={t('profile.awardsEmptyTitle')} body={t('profile.awardsEmptyBody')}>
            <button className="btn" onClick={onGoToFriends}>{t('friends.addFriendsTile')}</button>
          </EmptyTile>
        )}
      </div>
    </div>
  );
}

function ListeningTab() {
  const { t, language, me, openAlbum } = useApp();
  const [plays, setPlays] = useState<{ title: string; artist: string; cover: string | null; playedAt: string; albumId: string | null }[] | null>(null);
  useEffect(() => {
    if (!me) return;
    let cancelled = false;
    fetch(`/api/stats?period=week&weekStart=${me.weekStart}`).then((r) => (r.ok ? r.json() : null)).then((d) => { if (!cancelled) setPlays(d?.recentPlays ?? []); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id]);
  return (
    <div className="tile">
      {plays === null ? <p className="muted">{t('stats.loading')}</p> : plays.length ? plays.slice(0, 8).map((p, i) => (
        <button className="row" key={i} onClick={() => p.albumId && openAlbum(p.albumId)} style={{ cursor: p.albumId ? 'pointer' : 'default' }}>
          <CoverArt url={p.cover ?? undefined} fallbackLetter={p.artist[0] || '?'} className="cov" style={{ width: 48, height: 48 }} />
          <span className="g"><b>{p.title}</b><small className="muted" style={{ fontWeight: 600 }}>{p.artist}</small></span>
          <small className="muted" style={{ fontWeight: 700 }}>{formatRelative(p.playedAt, language)}</small>
        </button>
      )) : (
        <>
          <p className="muted" style={{ fontWeight: 600 }}>{t('profile.notEnoughData')}</p>
          {/* No plays and no Spotify: offer the connection right here. */}
          {me && !me.connections.spotify && <div className="acts"><a className="btn" href="/api/auth/spotify">{t('profile.connectSpotify')}</a></div>}
        </>
      )}
    </div>
  );
}

function FriendsTab() {
  const { t, me, friendRequests, respondToFriendRequest, viewFriend, addFriend, showToast } = useApp();
  const scores = useFriendScores(me, 50);
  const [handle, setHandle] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);
  if (!me) return null;
  const { incoming, outgoing } = friendRequests;
  const inviteUrl = typeof window !== 'undefined' ? `${window.location.origin}${invitePath(me)}` : invitePath(me);
  const inviteLabel = inviteUrl.replace(/^https?:\/\//, '');

  const add = async () => {
    const h = handle.trim().replace(/^@/, '').toLowerCase();
    if (!/^[a-z0-9_]{3,20}$/.test(h)) { setErr(t('login.handleFormat')); return; }
    setErr('');
    setBusy(true);
    await addFriend(h);
    setBusy(false);
    setHandle('');
  };
  const share = async () => {
    const text = t('friends.inviteLinkMessage', { name: me.name.split(' ')[0] });
    if (navigator.share) {
      try { await navigator.share({ url: inviteUrl, text }); return; } catch { /* cancelled — copy instead */ }
    }
    try {
      await navigator.clipboard.writeText(`${text} ${inviteUrl}`);
      showToast(t('toast.inviteCopied'));
    } catch {
      showToast(inviteUrl);
    }
  };
  const toggleQr = async () => {
    if (!qr) {
      const QRCode = (await import('qrcode')).default;
      setQr(await QRCode.toDataURL(inviteUrl, { width: 220, margin: 1, color: { dark: '#171410', light: '#ffffff' } }));
    }
    setShowQr((v) => !v);
  };

  return (
    <div className="bento b3">
      <div className="tile s2">
        <h2>{t('friends.incomingRequests')}</h2>
        {incoming.length > 0 && <p className="muted" style={{ fontWeight: 800, fontSize: 13, margin: '0 0 4px' }}>{t('friends.incomingL')}</p>}
        {incoming.map((r) => (
          <div className="row" key={r.id}>
            <button className="rowlink" onClick={() => viewFriend(r.user.id)}>
              <span className="dot" style={userAvatarStyle(r.user)}>{!r.user.avatarUrl && <Initial name={r.user.name} />}</span>
              <span className="g"><b>{r.user.name}</b><small className="muted" style={{ fontWeight: 600 }}>{r.user.handle}</small></span>
            </button>
            <button className="btn" style={{ padding: '8px 16px' }} onClick={() => respondToFriendRequest(r.id, 'accept')}>{t('friends.accept')}</button>
            <button className="btn ghost" style={{ padding: '8px 16px' }} onClick={() => respondToFriendRequest(r.id, 'decline')}>{t('friends.decline')}</button>
          </div>
        ))}
        {outgoing.length > 0 && <p className="muted" style={{ fontWeight: 800, fontSize: 13, margin: '12px 0 4px' }}>{t('friends.sentL')}</p>}
        {outgoing.map((r) => (
          <div className="row" key={r.id}>
            <button className="rowlink" onClick={() => viewFriend(r.user.id)}>
              <span className="dot" style={userAvatarStyle(r.user)}>{!r.user.avatarUrl && <Initial name={r.user.name} />}</span>
              <span className="g"><b>{r.user.name}</b></span>
            </button>
            <span className="tag">{t('friends.pendingBadge')}</span>
            <button className="btn ghost" style={{ padding: '8px 16px' }} onClick={() => respondToFriendRequest(r.id, 'cancel')}>{t('friends.cancel')}</button>
          </div>
        ))}
        {!incoming.length && !outgoing.length && <p className="muted" style={{ fontWeight: 600 }}>{t('friends.noPending')}</p>}
      </div>

      <div className="tile">
        <h2>{t('friends.addAFriend')}</h2>
        <label htmlFor="addh">{t('friends.handleLabel')}</label>
        <form style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }} onSubmit={(e) => { e.preventDefault(); if (!busy) add(); }}>
          <input className="field" id="addh" placeholder={t('friends.handlePlaceholder')} style={{ flex: 1, minWidth: 160 }} value={handle} onChange={(e) => { setHandle(e.target.value); setErr(''); }} />
          <button className="btn" type="submit" disabled={busy}>{t('friends.add')}</button>
        </form>
        <p className="ferr" role="alert">{err}</p>
      </div>

      <div className="tile s2">
        <h2>{t('profile.friends')}</h2>
        {me.friends.length ? me.friends.map((f) => (
          <button className="row" key={f.id} onClick={() => viewFriend(f.id)}>
            <span className="dot" style={userAvatarStyle(f)}>{!f.avatarUrl && <Initial name={f.name} />}</span>
            <span className="g"><b>{f.name}</b><small className="muted" style={{ fontWeight: 600 }}>{t('friends.sharedArtistsN', { n: scores[f.id]?.shared ?? 0 })}</small></span>
            <span className="num" style={{ fontSize: 30 }}>{scores[f.id]?.pct != null ? `${scores[f.id]!.pct}%` : '—'}</span>
            <span className="tag">{t('friends.viewProfile')}</span>
          </button>
        )) : <EmptyTile plain title={t('friends.empty')} body={t('friends.emptyBody')} />}
      </div>

      <div className="tile t-ac">
        <h2>{t('friends.inviteLinkTitle')}</h2>
        <p style={{ fontWeight: 700, wordBreak: 'break-all' }}>{inviteLabel}</p>
        <div className="acts">
          <button className="btn" onClick={share}>{t('friends.getInviteLink')}</button>
          <button className="btn ghost" aria-pressed={showQr} onClick={toggleQr}>{showQr ? t('friends.hideQr') : t('friends.showQr')}</button>
        </div>
        {showQr && qr && (
          <div className="qrw">
            {/* eslint-disable-next-line @next/next/no-img-element -- a locally generated data: URI */}
            <img src={qr} alt={t('friends.qrAlt')} className="qr" />
            <small style={{ fontWeight: 700, display: 'block', marginTop: 6 }}>{t('friends.qrHint')}</small>
          </div>
        )}
        <a className="link" href={invitePath(me)} target="_blank" rel="noreferrer" style={{ marginTop: 12, display: 'inline-block' }}>{t('friends.previewInvite')}</a>
      </div>
    </div>
  );
}

export function ProfileScreen(_props: { device: Device }) {
  const { t, language, me, myRatings, updateProfileName, updateProfileHandle, updateAvatar, showScreen, viewHistory, friendRequests, showToast } = useApp();
  const [tab, setTab] = useState<ProfileTab>('ratings');
  const incomingRequests = friendRequests.incoming.length;
  // The avatar menu's "Friend requests" item lands here on the friends tab.
  useEffect(() => {
    const onTab = (e: Event) => setTab((e as CustomEvent<ProfileTab>).detail);
    window.addEventListener(PROFILE_TAB_EVENT, onTab);
    return () => window.removeEventListener(PROFILE_TAB_EVENT, onTab);
  }, []);
  const list = useMemo(() => [...myRatings].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()), [myRatings]);

  if (!me) return null;
  const handle = me.handle.replace(/^@/, '');
  const avg = list.length ? list.reduce((s, r) => s + r.stars, 0) / list.length : 0;
  const reviews = list.filter((r) => !!r.review).length;

  const shareProfile = () => {
    const url = `${window.location.origin}/u/${handle}`;
    try {
      navigator.clipboard.writeText(url).then(() => showToast(t('profile.shareLinkCopied')), () => showToast(url));
    } catch {
      showToast(url);
    }
  };

  return (
    <>
      <div className="tile t-ink glow prof">
        <label className="avwrap" aria-label={t('profile.uploadPhoto')}>
          <span className="avt lgA" style={userAvatarStyle(me)}>{!me.avatarUrl && me.name[0].toUpperCase()}</span>
          <input
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = () => updateAvatar(reader.result as string);
              reader.readAsDataURL(file);
            }}
          />
          <span className="avhint">{t('profile.changePhoto')}</span>
        </label>
        <div className="pinfo">
          <label className="sr" htmlFor="pname">{t('profile.displayName')}</label>
          <input
            className="pname"
            id="pname"
            maxLength={24}
            defaultValue={me.name}
            key={`n-${me.name}`}
            onBlur={async (e) => { if (e.target.value.trim() !== me.name && !(await updateProfileName(e.target.value))) e.target.value = me.name; }}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
          />
          <div className="phandle">
            <span>@</span>
            <label className="sr" htmlFor="phandle">{t('friends.handleLabel')}</label>
            <input
              id="phandle"
              maxLength={20}
              defaultValue={handle}
              key={`h-${handle}`}
              onBlur={async (e) => { if (e.target.value.trim() !== handle && !(await updateProfileHandle(e.target.value))) e.target.value = handle; }}
              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
            />
          </div>
          <p className="muted" style={{ fontWeight: 600, marginTop: 4 }}>{t('profile.joined')} {formatJoinDate(me.joinedAt, language)} · {t('profile.tapToEditHint')}</p>
          <div className="acts" style={{ marginTop: 12 }}>
            <button className="btn" onClick={shareProfile}>{t('profile.shareProfile')}</button>
            <a className="btn ghost" href={`/u/${handle}`} target="_blank" rel="noreferrer">{t('profile.previewPublicPage')}</a>
          </div>
        </div>
        <div className="pcnt">
          {[[String(list.length), t('profile.ratingsL')], [fmt1(avg), t('profile.avgScoreL')], [String(reviews), t('profile.reviewsL')], [String(me.friends.length), t('profile.friendsL')]].map(([v, l]) => (
            <div key={l}><span className="num" style={{ fontSize: 34, color: 'var(--acct)' }}>{v}</span><br /><small style={{ fontWeight: 700 }}>{l}</small></div>
          ))}
        </div>
      </div>

      <div className="bento" style={{ margin: '14px 0' }}>
        <button className="tile t-ac" style={{ textAlign: 'left' }} onClick={() => viewHistory('profile')}>
          <h3>{t('profile.quickHistory')}</h3><p style={{ fontWeight: 600, marginTop: 4 }}>{t('profile.quickHistorySub')}</p>
        </button>
        <button className="tile t-pop" style={{ textAlign: 'left' }} onClick={() => showScreen('stats')}>
          <h3>{t('profile.quickStats')}</h3><p className="muted" style={{ fontWeight: 600, marginTop: 4 }}>{t('profile.quickStatsSub')}</p>
        </button>
        <button className="tile" style={{ textAlign: 'left' }} onClick={() => showScreen('groups')}>
          <h3>{t('profile.quickGroups')}</h3><p className="muted" style={{ fontWeight: 600, marginTop: 4 }}>{t('profile.quickGroupsSub')}</p>
        </button>
        <div className="tile t-soft2">
          <h3>{t('profile.quickSettings')}</h3>
          <label htmlFor="qreg" style={{ marginTop: 10 }}>{t('profile.region')}</label>
          <RegionInput id="qreg" />
          <button className="link" style={{ marginTop: 10, display: 'inline-block' }} onClick={() => showScreen('settings')}>{t('settings.openAll')} →</button>
        </div>
      </div>

      <div className="sec" style={{ marginTop: 30 }}>
        <div className="chips">
          {TAB_ORDER.map((k) => (
            <button key={k} className={`chip${tab === k ? ' on' : ''}`} onClick={() => setTab(k)}>
              {t(TAB_KEY[k])}
              {k === 'friends' && incomingRequests > 0 && <span className="badge" aria-label={t('friends.newRequestsAria', { count: incomingRequests })}>{incomingRequests}</span>}
            </button>
          ))}
        </div>
        {tab === 'ratings' && <RatingsTab list={list} avg={avg} reviews={reviews} />}
        {tab === 'reviews' && <ReviewsTab list={list} />}
        {tab === 'loved' && <LovedTab />}
        {tab === 'later' && <LaterTab />}
        {tab === 'taste' && <TasteTab list={list} />}
        {tab === 'awards' && <AwardsTab onGoToFriends={() => setTab('friends')} />}
        {tab === 'listening' && <ListeningTab />}
        {tab === 'friends' && <FriendsTab />}
      </div>
    </>
  );
}

