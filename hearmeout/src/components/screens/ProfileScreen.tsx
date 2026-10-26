'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArtistAvatar, useOpenArtist } from '../ui/ArtistName';
import { fmt1, fmtHours } from '@/lib/numberFormat';
import { PROFILE_TAB_EVENT, takeRecentEvent } from '@/lib/uiEvents';
import { useApp } from '@/lib/AppContext';
import { squareImageDataUrl } from '@/lib/imageResize';
import { invitePath } from '@/lib/pendingInvite';
import type { Device, RatingRecord, RecapData, StatsData } from '@/lib/types';
import { userAvatarStyle, formatJoinDate, formatRelative } from '@/lib/format';
import { regionDisplayName, toLocale } from '@/lib/i18n';
import { LovedTracksColumn, LovedAlbumsColumn, LovedArtistsColumn } from '../ProfileBlocks';
import { CoverArt } from '../ui/CoverArt';
import { AlbumShelfCard, ReviewCard, Shelf } from '../ui/SuperCards';
import { MascotIcon } from '../redesign/icons';
import { useFriendScores } from '@/lib/useFriendScores';
import type { TranslationKey } from '@/lib/i18n';
import { useLaterPlay } from './LaterScreen';
import { Initial } from '../ui/Initial';
import { AddFriendCard, FriendPlayerCard } from '../FriendPlayerCard';
import { cachedJson, peekJson, useCachedJson } from '@/lib/cachedJson';
import { AwardGallery } from '../AwardGallery';
import { CoverWall, GenreMix, PersonCards, Phrase, ScoreBars, usePersonColor } from '../ui/Visual';

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

function EmptyTile({ title, body, children, plain }: { title: string; body: string; children?: React.ReactNode; plain?: boolean }) {
  return (
    <div className={plain ? 'empty' : 'tile t-soft2 empty'} style={plain ? { padding: 10 } : undefined}>
      <MascotIcon />
      <h3>{title}</h3>
      {body && <p className="muted" style={{ fontWeight: 600 }}>{body}</p>}
      {children}
    </div>
  );
}

// Ratings as a wall of covers with the score on each (not a list of rows).
function RatingsTab({ list }: { list: RatingRecord[] }) {
  const { t, viewHistory, openAlbum } = useApp();
  const albumOf = useAlbumOf();
  if (!list.length) return <EmptyTile title={t('profile.noRatingsYet')} body="" />;
  return (
    <>
      <CoverWall items={list.slice(0, 12).map((r) => {
        const a = albumOf(r.albumId);
        return { key: r.albumId, cover: a.cover, title: a.title, artist: a.artist, badge: fmt1(r.stars), onClick: () => openAlbum(r.albumId) };
      })} />
      <div className="acts"><button className="btn ghost" onClick={() => viewHistory('profile')}>{t('profile.seeAllRatings', { count: list.length })}</button></div>
    </>
  );
}

function ReviewsTab({ list }: { list: RatingRecord[] }) {
  const { t, me } = useApp();
  const rv = list.filter((r) => !!r.review);
  if (!rv.length) return <div className="stack"><EmptyTile title={t('profile.noReviewsTitle')} body={t('profile.noReviewsBody')} /></div>;
  return (
    <div className="stack">
      {rv.map((r) => <ReviewCard key={r.albumId} user={{ id: me?.id, name: me?.name ?? '', avatarUrl: me?.avatarUrl ?? null }} createdAt={r.createdAt} stars={r.stars} review={r.review} tags={r.tags} albumId={r.albumId} />)}
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
      <div className="sec"><h2>{t('profile.lovedTracksTitle')}</h2><LovedTracksColumn /></div>
      <div className="sec"><h2>{t('profile.lovedAlbumsTitle')}</h2><LovedAlbumsColumn /></div>
      <div className="sec"><h2>{t('profile.lovedArtistsTitle')}</h2><LovedArtistsColumn /></div>
    </>
  );
}

function LaterTab() {
  const { t, laterItems, showScreen } = useApp();
  const play = useLaterPlay();
  const sorted = [...laterItems].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  if (!sorted.length) return <EmptyTile title={t('later.emptyTitle')} body={t('profile.laterEmptyBody')} />;
  // Covers to tap and play; everything else is on the Listen later page.
  return (
    <>
      <CoverWall items={sorted.slice(0, 12).map((item) => ({
        key: String(item.id), cover: item.cover, title: item.title, artist: item.artist,
        sub: item.type === 'album' ? t('later.tagAlbum') : t('later.tagTrack'), onClick: () => play(item),
      }))} />
      <div className="acts"><button className="btn ghost" onClick={() => showScreen('later')}>{t('later.openLater')} →</button></div>
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
  // Your own pick when you made one, else your four best scores.
  const pinned = me?.pinnedAlbums ?? null;
  const scoreOf = new Map(list.map((r) => [r.albumId, r.stars] as const));
  const top4 = pinned?.length
    ? pinned.map((albumId) => ({ albumId, stars: scoreOf.get(albumId) ?? null }))
    : [...list].sort((a, b) => b.stars - a.stars).slice(0, 4).map((r) => ({ albumId: r.albumId, stars: r.stars as number | null }));
  const [picking, setPicking] = useState(false);
  const genres = me?.genres ?? [];
  return (
    <div className="bento b3">
      <div className="tile s2">
        <h2>{t('profile.taste')}</h2>
        {fp.length ? (
          <ScoreBars items={fp.slice(0, 6).map((x) => ({ name: x.g, score: x.avg, sub: t('profile.ratedN', { n: x.n }) }))} />
        ) : <p className="muted" style={{ fontWeight: 600 }}>{t('profile.fingerprintEmpty')}</p>}
      </div>
      <div className="tile">
        <h2>{t('profile.favoriteGenres')}</h2>
        {genres.length ? (
          <GenreMix items={genres.slice(0, 6).map((g) => ({ name: g.g, pct: g.pct }))} />
        ) : <p className="muted" style={{ fontWeight: 600 }}>{t('profile.notEnoughData')}</p>}
      </div>
      <div className="tile s3">
        <div className="hd10">
          <h2 style={{ margin: 0 }}>{t('profile.top4')}</h2>
          {list.length > 0 && <button className="btn ghost" onClick={() => setPicking(true)}>{t('top4.edit')}</button>}
        </div>
        {top4.length ? (
          <div className="t4">
            {top4.map((r) => {
              const a = albumOf(r.albumId);
              return (
                <button key={r.albumId} onClick={() => openAlbum(r.albumId)} style={{ textAlign: 'left', color: 'inherit' }}>
                  <div className="cvw">
                    <CoverArt url={a.cover} fallbackLetter={a.artist[0] || '?'} className="cov" px={170} style={{ width: '100%', aspectRatio: '1' }} />
                    {r.stars != null && <span className="bdg">{fmt1(r.stars)}</span>}
                  </div>
                  <b style={{ display: 'block', marginTop: 8, fontSize: 14 }}>{a.title}</b>
                </button>
              );
            })}
          </div>
        ) : <p className="muted" style={{ fontWeight: 600 }}>{t('profile.noRatingsYet')}</p>}
      </div>
      {picking && <Top4Picker list={list} initial={pinned ?? top4.map((x) => x.albumId)} onClose={() => setPicking(false)} />}
    </div>
  );
}

// Picking the profile's top 4: your rated albums best first, tap to add or
// remove (the order you tap is the order shown), save or go back to the
// automatic pick.
function Top4Picker({ list, initial, onClose }: { list: RatingRecord[]; initial: string[]; onClose: () => void }) {
  const { t, updatePinnedAlbums, showToast } = useApp();
  const albumOf = useAlbumOf();
  const [sel, setSel] = useState<string[]>(initial.slice(0, 4));
  const [busy, setBusy] = useState(false);
  const albums = [...list].sort((a, b) => b.stars - a.stars);
  const toggle = (id: string) => setSel((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= 4 ? cur : [...cur, id]));
  const save = async (ids: string[] | null) => {
    setBusy(true);
    const ok = await updatePinnedAlbums(ids);
    setBusy(false);
    showToast(ok ? t('top4.saved') : t('top4.failed'));
    if (ok) onClose();
  };
  if (typeof document === 'undefined' || !document.querySelector('.rd')) return null;
  return createPortal(
    <div className="modalbg" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal tile t4p19" role="dialog" aria-modal="true" aria-labelledby="t4pt">
        <h2 id="t4pt" style={{ marginBottom: 4 }}>{t('top4.pickTitle')}</h2>
        <p className="muted" style={{ fontWeight: 600, marginBottom: 12 }}>{t('top4.pickHint', { n: sel.length })}</p>
        <div className="grd">
          {albums.map((r) => {
            const a = albumOf(r.albumId);
            const at = sel.indexOf(r.albumId);
            return (
              <button key={r.albumId} className={at >= 0 ? 'on' : ''} onClick={() => toggle(r.albumId)} aria-pressed={at >= 0} aria-label={a.title}>
                <CoverArt url={a.cover} fallbackLetter={a.artist[0] || '?'} className="cov" px={120} style={{ width: '100%', aspectRatio: '1' }} />
                {at >= 0 && <span className="n">{at + 1}</span>}
                <small>{a.title}</small>
              </button>
            );
          })}
        </div>
        <div className="acts">
          <button className="btn" disabled={busy || !sel.length} onClick={() => save(sel)}>{t('top4.save')}</button>
          <button className="btn ghost" disabled={busy} onClick={() => save(null)}>{t('top4.auto')}</button>
        </div>
      </div>
    </div>,
    document.querySelector('.rd')!,
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
    // Same month recaps the recap screen and the preloader use
    // (lib/cachedJson): stored copies first, then fresh ones.
    const url = (id: string) => `/api/recap?period=month&userId=${id}&tz=${new Date().getTimezoneOffset()}`;
    const row = (p: Person, d: RecapData | null) => (d ? { ...p, minutes: d.minutes, artists: d.uniqueArtists, awards: (d.awards || []) as string[] } : null);
    const build = (rows: ReturnType<typeof row>[]) => {
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
    };
    const stored = people.map((p) => row(p, peekJson<RecapData>(url(p.id))));
    if (stored[0]) build(stored);
    Promise.all(people.map(async (p) => row(p, await cachedJson<RecapData>(url(p.id))))).then(build);
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupKey]);

  if (!me) return null;
  const who = (p: Person) => (p.id === me.id ? t('profile.you') : p.name);
  return (
    <div className="bento b3">
      <div className="tile s2">
        <h2>{t('profile.yourAwards')}</h2>
        {data === null ? <span className="muted">{t('awards.computing')}</span> : <AwardGallery earned={data.mine} showLocked />}
      </div>
      <div className="tile t-soft2">
        <h2>{t('profile.monthAwards')}</h2>
        {data && data.minutes && data.niche ? (
          <PersonCards grid people={[
            { id: `m-${data.minutes.id}`, name: who(data.minutes), avatarUrl: data.minutes.avatarUrl, value: t('profile.hoursN', { n: data.minutes.v }), sub: t('awards.mostMinutes') },
            { id: `n-${data.niche.id}`, name: who(data.niche), avatarUrl: data.niche.avatarUrl, value: t('profile.uniqueArtistsN', { n: data.niche.v }), sub: t('awards.mostNiche') },
          ]} />
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
  const [week, setWeek] = useState<StatsData | null>(null);
  useEffect(() => {
    if (!me) return;
    let cancelled = false;
    const url = `/api/stats?period=week&weekStart=${me.weekStart}&offset=0`;
    const stored = peekJson<StatsData>(url);
    if (stored) { setPlays(stored.recentPlays ?? []); setWeek(stored); }
    cachedJson<StatsData>(url).then((d) => { if (!cancelled) { setPlays(d?.recentPlays ?? []); setWeek(d); } });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id]);
  return (
    <>
    {/* This week at a glance (rev 9c). */}
    {/* This week as a phrase, then what was played as covers. */}
    {week && week.hours > 0 && (
      <Phrase parts={[
        [`${fmtHours(week.hours)} ${t('unit.h')}`, t('recap.listened')],
        [week.newArtistCount, t('recap.newArtists')],
      ]} />
    )}
    {plays === null ? <p className="muted">{t('stats.loading')}</p> : plays.length ? (
      <CoverWall items={plays.slice(0, 12).map((p, i) => ({
        key: `${i}-${p.playedAt}`, cover: p.cover, title: p.title, artist: p.artist,
        sub: formatRelative(p.playedAt, language), onClick: p.albumId ? () => openAlbum(p.albumId!) : undefined,
      }))} />
    ) : (
      <div className="tile t-soft2">
        <p className="muted" style={{ fontWeight: 600 }}>{t('profile.notEnoughData')}</p>
        {/* No plays and no Spotify: offer the connection right here. */}
        {me && !me.connections.spotify && <div className="acts"><a className="btn" href="/api/auth/spotify">{t('profile.connectSpotify')}</a></div>}
      </div>
    )}
    </>
  );
}

function FriendsTab() {
  const { t, me, friendRequests, respondToFriendRequest, viewFriend, showToast } = useApp();
  const scores = useFriendScores(me, 50);
  const [qr, setQr] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);
  if (!me) return null;
  const { incoming, outgoing } = friendRequests;
  const inviteUrl = typeof window !== 'undefined' ? `${window.location.origin}${invitePath(me)}` : invitePath(me);
  const inviteLabel = inviteUrl.replace(/^https?:\/\//, '');

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
      {(incoming.length > 0 || outgoing.length > 0) && (
      <div className="tile s3">
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
      </div>
      )}

      <div className="s2 fcg20w">
        <h2>{t('profile.friends')}</h2>
        {!me.friends.length && <p className="muted" style={{ fontWeight: 600, marginBottom: 12 }}>{t('friends.emptyBody')}</p>}
        <div className="fcg20">
          {me.friends.map((f) => <FriendPlayerCard key={f.id} user={f} pct={scores[f.id]?.pct ?? null} />)}
          <AddFriendCard />
        </div>
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
  const { t, language, me, myRatings, updateProfileName, updateProfileHandle, updateAvatar, showScreen, friendRequests, showToast } = useApp();
  const weekStats = useCachedJson<StatsData>(me ? `/api/stats?period=week&weekStart=${me.weekStart}&offset=0` : null).data;
  // The header in your colour, your photo blurred over it.
  const myColor = usePersonColor(me ?? { id: '', name: '?', avatarUrl: null });
  const [tab, setTab] = useState<ProfileTab>('ratings');
  const tabsRef = useRef<HTMLDivElement>(null);
  const openFriends = () => { setTab('friends'); tabsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  const incomingRequests = friendRequests.incoming.length;
  // The avatar menu's "Friend requests" item lands here on the friends tab.
  useEffect(() => {
    const onTab = (e: Event) => setTab((e as CustomEvent<ProfileTab>).detail);
    // A jump that opened this screen for the first time fired before it mounted.
    const pending = takeRecentEvent<ProfileTab>(PROFILE_TAB_EVENT);
    if (pending) setTab(pending);
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
      {/* The visible name is an editable field, so the page heading for
          screen readers is this hidden one. */}
      <h1 className="sr">{me.name}</h1>
      {/* Header: a coloured block with the photo, name, handle and region,
          then friends / edit profile / share. */}
      <div className="phd14 ph16" style={{ ['--g1' as string]: myColor, ['--a1' as string]: me.avatarUrl ? `url('${me.avatarUrl}')` : 'none' } as React.CSSProperties}>
        <label className="avwrap" aria-label={t('profile.uploadPhoto')}>
          <span className="avt lgA" style={{ ...userAvatarStyle(me), backgroundSize: 'cover' }}>{!me.avatarUrl && me.name[0].toUpperCase()}</span>
          <input
            type="file"
            accept="image/*"
            hidden
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              const dataUrl = await squareImageDataUrl(file);
              if (dataUrl) updateAvatar(dataUrl);
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
          <p className="ploc">{me.region ? `${regionDisplayName(me.region, language)} · ` : ''}{t('profile.joined')} {formatJoinDate(me.joinedAt, language)}</p>
        </div>
        <div className="pbt14">
          <button className="pb" onClick={openFriends}>
            {me.friends.length > 0 && (
              <span className="avs">
                {me.friends.slice(0, 3).map((f) => <span key={f.id} className="dot" style={{ ...userAvatarStyle(f), backgroundSize: 'cover' }}>{!f.avatarUrl && f.name[0]?.toUpperCase()}</span>)}
              </span>
            )}
            <span className="l">{t('profile.friendsBtn')}</span>
            {incomingRequests > 0 && <span className="badge" aria-label={t('friends.newRequestsAria', { count: incomingRequests })}>{incomingRequests}</span>}
            <span className="ar">›</span>
          </button>
          <button className="btn" onClick={() => showScreen('settings')}>{t('profile.editBtn')}</button>
          <button className="btn ghost" onClick={shareProfile}>{t('profile.shareProfile')}</button>
        </div>
        <div className="pcnt">
          {[[String(list.length), t('profile.ratingsL', { n: list.length })], [fmt1(avg), t('profile.avgScoreL')], [String(reviews), t('profile.reviewsL', { n: reviews })], [String(me.friends.length), t('profile.friendsL', { n: me.friends.length })]].map(([v, l]) => (
            <div key={l}><span className="num">{v}</span><small>{l}</small></div>
          ))}
          <a className="pub" href={`/u/${handle}`} target="_blank" rel="noreferrer">{t('profile.previewPublicPage')} ↗</a>
        </div>
      </div>

      <button className="tile t-c5 sst14" onClick={() => showScreen('stats')}>
        <i className="ic ic-bolt" aria-hidden="true" />
        <span className="g"><b>{t('profile.quickStats')}</b>{weekStats && weekStats.hours > 0 && <small>{t('profile.hoursWeek', { h: fmtHours(weekStats.hours) })}</small>}</span>
        <i className="ic ic-chev" aria-hidden="true" />
      </button>

      <ProfileTopArtists />
      <ProfileTopRated list={list} />
      <ProfileOnRepeat />

      <div className="sec" style={{ marginTop: 30 }} ref={tabsRef}>
        <div className="btab14" role="tablist" aria-label={t('nav.profile')}>
          {TAB_ORDER.map((k) => (
            <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
              {t(TAB_KEY[k])}
              {k === 'friends' && incomingRequests > 0 && <span className="badge" aria-label={t('friends.newRequestsAria', { count: incomingRequests })}>{incomingRequests}</span>}
            </button>
          ))}
        </div>
        {tab === 'ratings' && <RatingsTab list={list} />}
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

// "Top artists lately": this month's most played, as round photos.
function ProfileTopArtists() {
  const { t, me } = useApp();
  const openArtist = useOpenArtist();
  const month = useCachedJson<StatsData>(me ? `/api/stats?period=month&weekStart=${me.weekStart}` : null).data;
  const artists = month?.topArtists.slice(0, 8) ?? [];
  if (!artists.length) return null;
  return (
    <section className="sh14">
      <div className="hd"><h2>{t('profile.topArtistsLately')}</h2></div>
      <div className="hrow tal14">
        {artists.map((a) => (
          <button key={a.id || a.name} onClick={() => openArtist(a.name, a.id)}>
            <ArtistAvatar name={a.name} id={a.id} size={104} />
            <span className="nm">{a.name}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

// "Top rated music": your highest scores, covers on a shelf.
function ProfileTopRated({ list }: { list: RatingRecord[] }) {
  const { t, albums, liveAlbums, spotifyCovers, openAlbum, viewHistory } = useApp();
  const top = [...list].sort((a, b) => b.stars - a.stars || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 8);
  if (!top.length) return null;
  return (
    <Shelf title={t('profile.topRatedMusic')} right={<button className="link" onClick={() => viewHistory('profile')}>{t('common.seeAll')} ›</button>}>
      {top.map((r) => {
        const a = liveAlbums[r.albumId] || albums.find((x) => x.id === r.albumId);
        return (
          <AlbumShelfCard
            key={r.albumId}
            cover={a ? spotifyCovers[a.id] || a.cover : undefined}
            title={a?.title ?? '…'}
            artist={a?.artist ?? ''}
            artistId={a?.artistId}
            meta={`★ ${fmt1(r.stars)}`}
            onClick={() => openAlbum(r.albumId)}
          />
        );
      })}
    </Shelf>
  );
}

// "Last week · on repeat": the week's three most played songs, and the way
// into the full recap.
function ProfileOnRepeat() {
  const { t, language, me, ensureRecap, recapCache, openRecap, openAlbum } = useApp();
  useEffect(() => { if (me) ensureRecap('me', 'week'); }, [me, ensureRecap]);
  const r = me ? recapCache[`${me.id}:week`] : undefined;
  if (!r || !r.topSongs.length) return null;
  const start = new Date(r.range.start);
  const end = new Date((r.range.end ? new Date(r.range.end).getTime() : start.getTime() + 7 * 86400000) - 86400000);
  const fmt = (d: Date) => d.toLocaleDateString(toLocale(language), { day: 'numeric', month: 'short', timeZone: 'UTC' });
  return (
    <section className="sh14 orp14">
      <div className="hd"><h2>{t('stats.lastWeek')}</h2><small className="muted">{fmt(start)} – {fmt(end)} · {fmtHours(Math.round((r.minutes / 60) * 10) / 10)}{t('unit.h')}</small></div>
      <p className="k"><i className="ic ic-repeat" aria-hidden="true" /> {t('profile.onRepeat')}</p>
      <div className="g3">
        {r.topSongs.slice(0, 3).map((s, i) => (
          <button key={`${s.title}-${i}`} onClick={() => s.albumId && openAlbum(s.albumId)}>
            <span className="rn">{i + 1}</span>
            <CoverArt url={s.cover ?? undefined} fallbackLetter={s.artist[0] || '?'} className="cov" px={160} style={{ width: '100%', aspectRatio: '1' }} />
            <b>{s.title}</b>
            <small>{s.artist}</small>
          </button>
        ))}
      </div>
      <button className="btn ghost full14" onClick={() => openRecap('me', 'week')}>{t('profile.seeFullRecap')} →</button>
    </section>
  );
}
