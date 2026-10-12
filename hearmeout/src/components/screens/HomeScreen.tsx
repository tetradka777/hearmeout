'use client';

import { useEffect, useMemo, useState } from 'react';
import { fmt1, fmtHours } from '@/lib/numberFormat';
import { useApp } from '@/lib/AppContext';
import type { ApiUser, Device, FeedEvent, FeedResponse, PublicProfile, RecapData } from '@/lib/types';
import { CoverArt } from '../ui/CoverArt';
import { userAvatarStyle, formatRelative } from '@/lib/format';
import { Stars } from '../redesign/Stars';
import { MascotIcon } from '../redesign/icons';
import { MATCH_FRIEND_EVENT } from '@/lib/uiEvents';
import { useFriendScores } from '@/lib/useFriendScores';
import { toLocale, quoted } from '@/lib/i18n';
import { completedWeekRange, isoWeekNumber } from '@/lib/weeks';
import { cachedJson, peekJson, useCachedJson } from '@/lib/cachedJson';
import { computeMatch } from '@/lib/matchScore';
import { DEMO_PROFILES } from '@/lib/demoAccounts';
import { RECAP_SEEN_EVENT, recapSeenWeek } from '@/lib/recapSeen';
import { ImportNudge } from '../ConnectionBlocks';
import { PROFILE_TAB_EVENT } from '../redesign/AvatarMenu';
import { useAlbum } from '@/lib/useAlbum';

// Home (prototype rev 8–11, redesign/v7): the hot take and the week's recap
// card on top, friends' activity as compact rows in one tile, friends with
// their match, your day so far beside "rate what you played", and what's
// trending among your friends. Real data from /api/feed and the recaps;
// album/track metadata resolved client-side like the rest of the app.

// A recap needs this many plays; below it the card says so instead.
const RECAP_MIN_TRACKS = 10;
// Feed rows shown (the account owner asked for at most two).
const FEED_ROWS = 2;

function Dot({ user, label }: { user?: ApiUser; label?: string }) {
  return <span className="dot" style={user ? userAvatarStyle(user) : undefined}>{user ? (!user.avatarUrl && user.name[0]?.toUpperCase()) : label}</span>;
}

function HeroTile({ wide }: { wide: boolean }) {
  const { t, feed, showScreen } = useApp();
  const openMatchWith = (friendId: string) => { showScreen('match'); window.dispatchEvent(new CustomEvent(MATCH_FRIEND_EVENT, { detail: friendId })); };
  const hero = feed?.hero || null;
  const album = useAlbum(hero?.albumId || null);
  const span = wide ? 's3' : 's2';

  if (!hero || !album) {
    return (
      <section className={`tile t-ink hero glow ${span}`}>
        <span className="pill">{t('home.heroSticker')}</span>
        <h1>{t('home.heroEmptyTitle')}</h1>
        <p className="muted">{t('home.heroEmptySub')}</p>
      </section>
    );
  }

  return (
    <section className={`tile t-ink hero glow ${span}`}>
      <span className="pill">{t('home.heroSticker')}</span>
      <h1>{t('home.heroHeadline', { friend: hero.friend.name, album: album.title, theirScore: fmt1(hero.theirs), mine: fmt1(hero.mine) })}</h1>
      <div className="duel">
        <div className="bub b-ac"><span className="num">{fmt1(hero.mine)}</span><span className="w">{t('friend.you')}</span></div>
        <div className="bub b-pop r"><span className="num">{fmt1(hero.theirs)}</span><span className="w">{hero.friend.name}</span></div>
      </div>
      <div className="acts">
        <button className="btn lg" onClick={() => openMatchWith(hero.friend.id)}>{t('home.compareWith', { friend: hero.friend.name })}</button>
      </div>
    </section>
  );
}

// ----- Recap card (rev 8): new → one line once opened; too little → says so -----

function recapCovers(r: RecapData): string[] {
  const out: string[] = [];
  for (const s of r.topSongs) if (s.cover && !out.includes(s.cover)) out.push(s.cover);
  for (const a of r.topArtists) if (a.cover && !out.includes(a.cover)) out.push(a.cover);
  return out.slice(0, 2);
}

function RecapCard({ r, week }: { r: RecapData | undefined; week: number }) {
  const { t, openRecap } = useApp();
  const eyebrow = t('recapTeaser.weekEyebrow', { n: week });
  if (r && r.trackCount < RECAP_MIN_TRACKS) {
    return (
      <div className="tile t-soft2 rc empty" role="group" style={{ alignItems: 'flex-start', textAlign: 'left', minHeight: 250, justifyContent: 'center' }}>
        <div className="rc-top" style={{ width: '100%' }}><span>{eyebrow}</span></div>
        <MascotIcon />
        <h3 style={{ margin: 0 }}>{t('home.rcLowTitle')}</h3>
        <p className="muted" style={{ fontWeight: 600, margin: 0 }}>{t('home.rcLowSub', { min: RECAP_MIN_TRACKS, n: r.trackCount })}</p>
        <div style={{ width: '100%' }}>
          <div className="rc-bar" role="progressbar" aria-valuemin={0} aria-valuemax={RECAP_MIN_TRACKS} aria-valuenow={r.trackCount}>
            <i style={{ width: `${Math.round((r.trackCount / RECAP_MIN_TRACKS) * 100)}%` }} />
          </div>
        </div>
      </div>
    );
  }
  const covers = r ? recapCovers(r) : [];
  const award = r?.awards[0];
  return (
    <button className="tile t-ac rc" onClick={() => openRecap('me', 'week')}>
      <span className="rc-top"><span>{eyebrow}</span>{r && <span className="rc-new"><i aria-hidden="true" />{t('home.rcNew')}</span>}</span>
      <span className="rc-stage" aria-hidden="true">
        {covers.map((c, i) => (
          <span key={c} className={i === 0 ? 'c1' : 'c2'}><CoverArt url={c} fallbackLetter="?" className="cov" px={116} style={{ width: '100%', aspectRatio: '1' }} /></span>
        ))}
        {award && <span className="rc-stat"><small>{t('home.rcStatus')}</small><b>{t(`groups.${award}` as never)}</b></span>}
      </span>
      <span className="rc-nums">
        <span><b>{r ? `${fmtHours(Math.round(r.minutes / 60))}${t('unit.h')}` : '–'}</b><small>{t('recap.listened')}</small></span>
        <span><b>{r ? r.newArtists : '–'}</b><small>{t('recap.newArtists')}</small></span>
        <span><b>{r?.avgScore != null ? fmt1(r.avgScore) : '–'}</b><small>{t('recap.avgScore')}</small></span>
      </span>
      <span className="rc-foot"><span className="rc-fr" /><span className="rc-go">{t('recapTeaser.open')} →</span></span>
    </button>
  );
}

function RecapStrip({ r, week }: { r: RecapData; week: number }) {
  const { t, openRecap } = useApp();
  const award = r.awards[0];
  return (
    <button className="tile rcstrip" onClick={() => openRecap('me', 'week')}>
      <span className="mini">{recapCovers(r).map((c) => <CoverArt key={c} url={c} fallbackLetter="?" className="cov" px={34} style={{ width: 34, aspectRatio: '1' }} />)}</span>
      <span className="tt">{t('home.rcStripTitle', { n: week })}</span>
      <span className="mt">
        {award ? `${t(`groups.${award}` as never)} · ` : ''}{fmtHours(Math.round(r.minutes / 60))}{t('unit.h')} · <span className="x">{r.newArtists} {t('recap.newArtists')} · </span>{r.avgScore != null ? `${fmt1(r.avgScore)} ${t('recap.avgScore')}` : ''}
      </span>
      <span className="go">{t('home.rcOpenAgain')}</span>
    </button>
  );
}

// ----- Friends' activity (rev 11): one row per event in a single tile -----

function minutesLabel(min: number, t: (k: 'unit.h' | 'unit.m') => string): string {
  return min >= 60 ? `${Math.floor(min / 60)}${t('unit.h')}${String(min % 60).padStart(2, '0')}` : `${min}${t('unit.m')}`;
}

function FeedRow({ event }: { event: FeedEvent }) {
  const { t, language, myRatings, openAlbum, spotifyCovers } = useApp();
  const album = useAlbum(event.albumId);
  const time = formatRelative(event.at, language);
  const cover = (album && (spotifyCovers[album.id] || album.cover)) || (event.type !== 'rating_review' ? event.cover : null) || undefined;
  const open = () => { if (event.albumId) openAlbum(event.albumId); };

  if (event.type === 'session') {
    return (
      <button className="row fd11" onClick={open}>
        <Dot label={t('friend.you')[0]} />
        <span className="g"><b>{t('home.sessionTitle', { time: minutesLabel(event.minutes, t) })}</b><small className="muted">{t('home.sessionSub', { artists: event.artists, tracks: event.plays })} · {time}</small></span>
        <CoverArt url={cover} fallbackLetter="?" className="cov" style={{ width: 44, height: 44 }} />
      </button>
    );
  }

  if (event.type === 'first_play') {
    return (
      <button className="row fd11" onClick={open}>
        <Dot user={event.user} />
        <span className="g"><b>{t('home.feedPlayed', { name: event.user.name, album: album?.title || event.trackTitle })}</b><small className="muted">{t('home.firstPlayTag')} · {quoted(language, event.trackTitle)} · {time}</small></span>
        <CoverArt url={cover} fallbackLetter={event.artist[0] || '?'} className="cov" style={{ width: 44, height: 44 }} />
      </button>
    );
  }

  if (!album) return null;
  const mine = myRatings.find((r) => r.albumId === event.albumId)?.stars;
  const diff = mine != null ? Math.abs(mine - event.stars) : null;
  return (
    <button className="row fd11" onClick={open}>
      <Dot user={event.user} />
      <span className="g"><b>{t('home.feedRated', { name: event.user.name, album: album.title })}</b><small className="muted">{quoted(language, event.review)} · {time}</small></span>
      <span className="sc11">
        <b className="num">{fmt1(event.stars)}</b>
        {diff != null && diff >= 2 ? <small className="hot">{t('home.hotTake')}</small> : diff != null && diff <= 0.5 ? <small>{t('home.sameAsYou')}</small> : null}
      </span>
      <CoverArt url={cover} fallbackLetter={album.artist[0] || '?'} className="cov" style={{ width: 44, height: 44 }} />
    </button>
  );
}

type FeedFilter = 'all' | 'first_play' | 'rating_review' | 'session';

function FeedSection() {
  const { t, language, feed } = useApp();
  const [filter, setFilter] = useState<FeedFilter>('all');
  const events = feed?.events || [];
  const filtered = filter === 'all' ? events : events.filter((e) => e.type === filter);
  const today = new Date().toLocaleDateString(toLocale(language), { weekday: 'short', day: '2-digit', month: 'short' });
  const chip = (f: FeedFilter, label: string) => <button className={`chip${filter === f ? ' on' : ''}`} onClick={() => setFilter(f)}>{label}</button>;

  return (
    <div className="sec">
      <p className="eyebrow muted">{t('home.feedLive', { date: today }).toLowerCase()}</p>
      <h2>{t('home.feedTitle')}</h2>
      <div className="chips" role="group" aria-label={t('home.feedTitle')}>
        {chip('all', t('home.filterAll'))}
        {chip('first_play', t('home.filterFirstPlays'))}
        {chip('rating_review', t('home.filterRated'))}
        {chip('session', t('home.filterSession'))}
      </div>
      <div className="tile">
        {filtered.length ? filtered.slice(0, FEED_ROWS).map((e, i) => <FeedRow key={i} event={e} />) : (
          <div className="empty"><MascotIcon /><p className="muted">{t('home.feedEmpty')}</p></div>
        )}
      </div>
    </div>
  );
}

// ----- Friends (rev 11): a list with what they play and the match -----

function FriendRow({ user, demo, pct }: { user: ApiUser; demo: boolean; pct: number | null }) {
  const { t, language, viewFriend } = useApp();
  const { data: profile, failed } = useCachedJson<PublicProfile>(`/api/users/${user.id}`);
  if (demo && failed) return null; // a demo profile missing from this database
  const now = profile?.nowPlaying;
  const last = profile?.lastPlayed;
  const sub = now ? t('home.listeningTo', { title: now.title })
    : last ? t('home.lastPlayedRow', { title: last.title, when: formatRelative(last.startedAt, language) })
    : null;
  return (
    <button className="row fr11" onClick={() => viewFriend(user.id)}>
      <Dot user={user} />
      <span className="g">
        <b>{user.name}{demo && <> <span className="tag">{t('friends.demoTag')}</span></>}</b>
        {sub && <small className="muted">{sub}</small>}
      </span>
      <span className="pc11"><b className="num">{pct != null ? `${pct}%` : '—'}</b><small>{t('home.matchWord')}</small></span>
    </button>
  );
}

function FriendsList() {
  const { t, me, showScreen } = useApp();
  const scores = useFriendScores(me, 50);
  const demo = !!me && me.friends.length === 0;
  const people = demo ? DEMO_PROFILES : (me?.friends ?? []);
  if (!me) return null;
  const openFriendsTab = () => { showScreen('profile'); window.dispatchEvent(new CustomEvent(PROFILE_TAB_EVENT, { detail: 'friends' })); };
  return (
    <div className="sec">
      <div className="hd10">
        <h2 style={{ margin: 0 }}>{t('home.friendsHeader')}</h2>
        <button className="btn ghost" onClick={openFriendsTab}>{t('home.addFriendsBtn')}</button>
      </div>
      {demo && (
        <div className="tile t-ac" style={{ margin: '12px 0 14px', display: 'flex', gap: 14, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <div>
            <h3>{t('friends.inviteBannerTitle')}</h3>
            <p style={{ fontWeight: 700, marginTop: 4 }}>{t('friends.inviteBannerSub')}</p>
          </div>
          <button className="btn" onClick={openFriendsTab}>{t('friends.inviteBannerBtn')}</button>
        </div>
      )}
      <div className="tile" style={{ marginTop: 12 }}>
        {people.map((f) => <DemoAwareRow key={f.id} user={f} demo={demo} pct={scores[f.id]?.pct ?? null} myGenres={me.genres} />)}
      </div>
    </div>
  );
}

// Demo profiles aren't friends, so their match comes from their profile.
function DemoAwareRow({ user, demo, pct, myGenres }: { user: ApiUser; demo: boolean; pct: number | null; myGenres: Parameters<typeof computeMatch>[0] }) {
  const profile = useCachedJson<PublicProfile>(demo ? `/api/users/${user.id}` : null).data;
  const shown = demo ? (profile ? computeMatch(myGenres, profile.genres) : null) : pct;
  return <FriendRow user={user} demo={demo} pct={shown} />;
}

// ----- Your day so far + rate what you played (rev 11, two columns) -----

function DayTile() {
  const { me, t, language, feed, ensureRecap, recapCache } = useApp();
  useEffect(() => { if (me) ensureRecap('me', 'day'); }, [me, ensureRecap]);
  const r = me ? recapCache[`${me.id}:day`] : undefined;
  const hourly = useMemo(() => {
    const h = new Array(24).fill(0) as number[];
    for (const at of feed?.todayPlays || []) h[new Date(at).getHours()]++;
    return h;
  }, [feed?.todayPlays]);
  const max = Math.max(...hourly);
  const peak = max > 0 ? hourly.indexOf(max) : null;
  const peakLabel = peak != null ? new Date(2000, 0, 1, peak).toLocaleTimeString(toLocale(language), { hour: '2-digit', minute: '2-digit', hour12: me?.timeFormat === '12' }) : null;
  const rep = feed?.onRepeat;
  const foot = [peakLabel && t('home.dayPeak', { time: peakLabel }), rep && t('home.onRepeat', { title: rep.title, n: rep.plays })].filter(Boolean).join(' · ');
  return (
    <div className="tile">
      <div className="hd10"><h2 style={{ margin: 0 }}>{t('home.daySoFar')}</h2></div>
      <div className="kv11">
        <span><b className="num">{r?.trackCount ?? 0}</b><small>{t('home.cornerTracks')}</small></span>
        <span><b className="num">{minutesLabel(r?.minutes ?? 0, t)}</b><small>{t('home.listened')}</small></span>
        <span><b className="num">{r?.uniqueArtists ?? 0}</b><small>{t('home.cornerArtists')}</small></span>
      </div>
      <div className="hrs10">
        <span className="b9" aria-hidden="true">{hourly.map((v, i) => <i key={i} style={{ height: `${max ? Math.round((v / max) * 100) : 0}%` }} />)}</span>
      </div>
      {foot && <small className="muted" style={{ fontWeight: 700, display: 'block', marginTop: 8 }}>{foot}</small>}
    </div>
  );
}

function RateRow({ albumId }: { albumId: string }) {
  const { openAlbum, spotifyCovers } = useApp();
  const album = useAlbum(albumId);
  if (!album) return null;
  return (
    <button className="row" onClick={() => openAlbum(album.id)}>
      <CoverArt url={spotifyCovers[album.id] || album.cover} fallbackLetter={album.artist[0] || '?'} className="cov" style={{ width: 44, height: 44 }} />
      <span className="g"><b>{album.title}</b><small className="muted">{album.artist}</small></span>
      <Stars value={0} size={13} />
    </button>
  );
}

function RateTile() {
  const { t, myRatings, feed } = useApp();
  const rated = useMemo(() => new Set(myRatings.map((r) => r.albumId)), [myRatings]);
  const unrated = (feed?.recentAlbumIds || []).filter((id) => !rated.has(id)).slice(0, 3);
  return (
    <div className="tile">
      <div className="hd10"><h2 style={{ margin: 0 }}>{t('home.rateWhatPlayed')}</h2></div>
      {unrated.length ? unrated.map((id) => <RateRow key={id} albumId={id} />) : <p className="muted">{t('home.rateWhatPlayedEmpty')}</p>}
    </div>
  );
}

// ----- Trending in your circle (rev 10/11) -----

function TrendingRow({ rank, albumId, count, avg }: { rank: number; albumId: string; count: number; avg: number }) {
  const { t, openAlbum, spotifyCovers } = useApp();
  const album = useAlbum(albumId);
  if (!album) return null;
  return (
    <button className="row tr11" onClick={() => openAlbum(album.id)}>
      <span className="rk11">{rank}</span>
      <CoverArt url={spotifyCovers[album.id] || album.cover} fallbackLetter={album.artist[0] || '?'} className="cov" style={{ width: 44, height: 44 }} />
      <span className="g"><b>{album.title}</b><small className="muted">{album.artist} · {t('home.trendingFriends', { n: count })}</small></span>
      <b className="num" style={{ fontSize: 24, color: 'var(--acct)' }}>{fmt1(avg)}</b>
    </button>
  );
}

function TrendingSection() {
  const { t, feed } = useApp();
  const list = feed?.trending || [];
  if (!list.length) return null;
  return (
    <div className="sec">
      <div className="hd10">
        <div><h2 style={{ margin: 0 }}>{t('home.trendingTitle')}</h2><small className="muted" style={{ fontWeight: 700 }}>{t('home.trendingSub')}</small></div>
      </div>
      <div className="tile">{list.map((x, i) => <TrendingRow key={x.albumId} rank={i + 1} {...x} />)}</div>
    </div>
  );
}

export function HomeScreen(_props: { device: Device }) {
  const { me, setFeed, ensureRecap, recapCache } = useApp();
  const feedUrl = `/api/feed?tz=${new Date().getTimezoneOffset()}`;

  useEffect(() => {
    if (!me) return;
    let cancelled = false;
    // The stored copy first (lib/cachedJson), then the fresh feed.
    const stored = peekJson<FeedResponse>(feedUrl);
    if (stored) setFeed(stored);
    cachedJson<FeedResponse>(feedUrl).then((d) => { if (!cancelled && d) setFeed(d); });
    return () => { cancelled = true; };
  }, [me, setFeed, feedUrl]);

  useEffect(() => { if (me) ensureRecap('me', 'week'); }, [me, ensureRecap]);
  const [seenWeek, setSeenWeek] = useState<string | null>(null);
  useEffect(() => {
    const read = () => setSeenWeek(recapSeenWeek());
    read();
    window.addEventListener(RECAP_SEEN_EVENT, read);
    return () => window.removeEventListener(RECAP_SEEN_EVENT, read);
  }, []);

  if (!me) return null;
  const range = completedWeekRange(0, me.weekStart);
  const weekKey = range.start.toISOString().slice(0, 10);
  const week = isoWeekNumber(range.start);
  const r = recapCache[`${me.id}:week`];
  const seen = !!r && r.trackCount >= RECAP_MIN_TRACKS && seenWeek === weekKey;

  return (
    <>
      <div className="bento b3">
        <HeroTile wide={seen} />
        {!seen && <RecapCard r={r} week={week} />}
      </div>
      {seen && r && <RecapStrip r={r} week={week} />}

      <ImportNudge />

      <FeedSection />

      <FriendsList />

      <div className="sec two">
        <DayTile />
        <RateTile />
      </div>

      <TrendingSection />
    </>
  );
}
