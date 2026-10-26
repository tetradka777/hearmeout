'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { blurStyle } from '@/lib/imageColor';
import { sizedImage } from '@/lib/imageSize';
import { recapToneStyle } from '@/lib/recapTone';
import { ArtistName } from '../ui/ArtistName';
import { AlbumShelfCard, CardWho, DarkCard, Shelf } from '../ui/SuperCards';
import { SocialBar } from '../ui/Social';
import { socialKey } from '@/lib/socialClient';
import { fmt1, fmtHours } from '@/lib/numberFormat';
import { useApp } from '@/lib/AppContext';
import type { ApiUser, Device, FeedEvent, FeedResponse, PublicProfile, RecapData } from '@/lib/types';
import { CoverArt } from '../ui/CoverArt';
import { formatRelative, shortTitle } from '@/lib/format';
import { MascotIcon } from '../redesign/icons';
import { MATCH_FRIEND_EVENT } from '@/lib/uiEvents';
import { useFriendScores } from '@/lib/useFriendScores';
import { toLocale, quoted, type Language, type TranslationKey } from '@/lib/i18n';
import { completedWeekRange, isoWeekNumber } from '@/lib/weeks';
import { cachedJson, peekJson, useCachedJson } from '@/lib/cachedJson';
import { computeMatch } from '@/lib/matchScore';
import { DEMO_PROFILES } from '@/lib/demoAccounts';
import { RECAP_SEEN_EVENT, recapSeenWeek } from '@/lib/recapSeen';
import { yearRecapOpen, yearRecapYear } from '@/lib/yearRecap';
import { ratingStreak } from '@/lib/streak';
import { ImportNudge } from '../ConnectionBlocks';
import { RateQueueCard } from '../RateQueue';
import { AddFriendCard, FriendPlayerCard } from '../FriendPlayerCard';
import { FriendsPicksCard } from '../FriendsPicksCard';
import { PROFILE_TAB_EVENT } from '@/lib/uiEvents';
import { CoverWall } from '../ui/Visual';
import { useAlbum, useAlbums } from '@/lib/useAlbum';

// Home (prototype rev 8–11, redesign/v7): the hot take and the week's recap
// card on top, friends' activity as compact rows in one tile, friends with
// their match, your day so far beside "rate what you played", and what's
// trending among your friends. Real data from /api/feed and the recaps;
// album/track metadata resolved client-side like the rest of the app.

// A recap needs this many plays; below it the card says so instead.
const RECAP_MIN_TRACKS = 10;
// Feed rows shown (the account owner asked for at most two).
const FEED_ROWS = 2;

function HeroTile({ wide }: { wide: boolean }) {
  const { t, feed, showScreen } = useApp();
  const openMatchWith = (friendId: string) => { showScreen('match'); window.dispatchEvent(new CustomEvent(MATCH_FRIEND_EVENT, { detail: friendId })); };
  const hero = feed?.hero || null;
  const album = useAlbum(hero?.albumId || null);
  const span = wide ? 's3' : 's2';

  // No hot take this week: the block isn't shown at all.
  if (!hero || !album) return null;

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

function recapCovers(r: RecapData, n = 2): string[] {
  const out: string[] = [];
  for (const s of r.topSongs) if (s.cover && !out.includes(s.cover)) out.push(s.cover);
  for (const a of r.topArtists) if (a.cover && !out.includes(a.cover)) out.push(a.cover);
  return out.slice(0, n);
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
    <button className={`tile ${r ? 't-rc' : 't-ink'} rc`} style={recapToneStyle(r)} onClick={() => openRecap('me', 'week')}>
      <span className="rc-top"><span>{eyebrow}</span>{r && <span className="rc-new"><i aria-hidden="true" />{t('home.rcNew')}</span>}</span>
      <span className="rc-stage" aria-hidden="true">
        <span className="rc-covs">
          {covers.map((c, i) => (
            <span key={c} className={i === 0 ? 'c1' : 'c2'}><CoverArt url={c} fallbackLetter="?" className="cov" px={116} style={{ width: '100%', aspectRatio: '1' }} /></span>
          ))}
        </span>
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
    <button className="tile t-rc rcstrip" style={recapToneStyle(r)} onClick={() => openRecap('me', 'week')}>
      <span className="mini">{recapCovers(r, 3).map((c) => <CoverArt key={c} url={c} fallbackLetter="?" className="cov" px={34} style={{ width: 34, aspectRatio: '1' }} />)}</span>
      <span className="tt">{t('home.rcStripTitle', { n: week })}</span>
      <span className="mt">
        {award ? `${t(`groups.${award}` as never)} · ` : ''}{fmtHours(Math.round(r.minutes / 60))}{t('unit.h')} · <span className="x">{r.newArtists} {t('recap.newArtists')} · </span>{r.avgScore != null ? `${fmt1(r.avgScore)} ${t('recap.avgScore')}` : ''}
      </span>
      <span className="go">{t('home.rcOpenAgain')}</span>
      <i className="ic ic-chev go13" aria-hidden="true" />
    </button>
  );
}

// ----- Friends' activity (rev 11): one row per event in a single tile -----

function minutesLabel(min: number, t: (k: 'unit.h' | 'unit.m') => string): string {
  return min >= 60 ? `${Math.floor(min / 60)}${t('unit.h')}${String(min % 60).padStart(2, '0')}` : `${min}${t('unit.m')}`;
}

// When something happened, the way a friend would say it: "this evening"
// for today, "yesterday" and so on after that.
function whenLabel(at: string, language: Language, t: (k: TranslationKey) => string): string {
  const d = new Date(at);
  const now = new Date();
  if (d.toDateString() !== now.toDateString()) return formatRelative(at, language);
  const h = d.getHours();
  return t(h < 5 ? 'feed.whenNight' : h < 12 ? 'feed.whenMorning' : h < 18 ? 'feed.whenDay' : 'feed.whenEvening');
}

// One event as a dark card (after Superfan): who and when, the track or
// album large, a line about it, the details, and the cover on the right.
function FeedRow({ event }: { event: FeedEvent }) {
  const { t, language, myRatings, openAlbum, spotifyCovers, me, viewFriend } = useApp();
  const album = useAlbum(event.albumId);
  const cover = (album && (spotifyCovers[album.id] || album.cover)) || (event.type !== 'rating_review' ? event.cover : null) || undefined;
  const open = event.albumId ? () => openAlbum(event.albumId!) : undefined;
  const when = whenLabel(event.at, language, t);

  let who: { id?: string; name: string; avatarUrl: string | null } = { name: t('friend.you'), avatarUrl: me?.avatarUrl ?? null };
  let title = '';
  let sub = '';
  let meta: ReactNode = null;
  let right: ReactNode = null;
  if (event.type === 'session') {
    title = t('home.sessionTitle', { time: minutesLabel(event.minutes, t) });
    meta = t('home.sessionSub', { artists: event.artists, tracks: event.plays });
  } else if (event.type === 'first_play') {
    who = event.user;
    title = event.trackTitle;
    sub = t('home.firstPlayTag');
    meta = <><ArtistName name={event.artist} id={album?.artistId} size={16} />{album ? <span>&nbsp;· {album.title}</span> : null}</>;
  } else {
    if (!album) return null;
    who = event.user;
    title = album.title;
    const mine = myRatings.find((r) => r.albumId === event.albumId)?.stars;
    const diff = mine != null ? Math.abs(mine - event.stars) : null;
    sub = diff != null && diff >= 2 ? t('home.hotTake') : diff != null && diff <= 0.5 ? t('home.sameAsYou') : '';
    meta = <ArtistName name={album.artist} id={album.artistId} size={16} />;
    right = <>★ {fmt1(event.stars)}</>;
  }
  const openWho = 'id' in who && who.id && who.id !== me?.id ? () => viewFriend(who.id!) : undefined;
  // What comments and reactions on this card attach to (lib/social).
  const ownerId = event.type === 'session' ? me?.id : event.user.id;
  const target = !ownerId || !event.albumId ? null
    : event.type === 'rating_review' ? socialKey.review(ownerId, event.albumId)
    : socialKey.play(ownerId, event.albumId, event.at);
  return (
    <DarkCard
      cover={cover}
      head={<CardWho user={who} when={when} onClick={openWho} />}
      onOpen={open}
      openText
      className="rvc15 fdc15"
      footLeft={<SocialBar target={target} title={title} />}
      aside={cover ? (
        <button className="cvb" onClick={open} aria-label={title} tabIndex={-1}>
          <CoverArt url={cover} fallbackLetter={title[0] || '?'} className="cov" px={300} style={{ width: '100%', aspectRatio: '1' }} />
        </button>
      ) : undefined}
      extra={event.type === 'rating_review' && event.review ? <p className="q13 clamp">{quoted(language, event.review)}</p> : undefined}
    >
      {/* After Superfan's listening cards: big title, a white line, a grey
          line, the framed cover on the right. */}
      {open ? <button className="ft15" onClick={open} aria-label={title}><span>{shortTitle(title)}</span></button> : <h3 className="ft15"><span>{shortTitle(title)}</span></h3>}
      {(right || sub) && <p className="s15">{right}{right && sub ? ' · ' : ''}{sub}</p>}
      {meta && <p className="m15">{meta}</p>}
    </DarkCard>
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
      {filtered.length ? <div className="stack fd13s">{filtered.slice(0, FEED_ROWS).map((e, i) => <FeedRow key={i} event={e} />)}</div> : (
        <div className="tile empty"><MascotIcon /><p className="muted">{t('home.feedEmpty')}</p></div>
      )}
    </div>
  );
}

// ----- Friends: a row of cards you swipe through -----

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
      <div className="hrow fr13row" style={{ marginTop: 12 }}>
        {people.map((f) => <DemoAwareCard key={f.id} user={f} demo={demo} pct={scores[f.id]?.pct ?? null} myGenres={me.genres} />)}
        <AddFriendCard />
      </div>
    </div>
  );
}

// Demo profiles aren't friends, so their match comes from their profile.
function DemoAwareCard({ user, demo, pct, myGenres }: { user: ApiUser; demo: boolean; pct: number | null; myGenres: Parameters<typeof computeMatch>[0] }) {
  const profile = useCachedJson<PublicProfile>(demo ? `/api/users/${user.id}` : null).data;
  const shown = demo ? (profile ? computeMatch(myGenres, profile.genres) : null) : pct;
  return <FriendPlayerCard user={user} demo={demo} pct={shown} />;
}

// ----- Your day so far + rate what you played (two columns) -----

// Today's plays as three figures and the covers of what you played most,
// with the busiest hour and the track on repeat under them.
function DayTile() {
  const { me, t, language, feed, ensureRecap, recapCache, openAlbum } = useApp();
  useEffect(() => { if (me) ensureRecap('me', 'day'); }, [me, ensureRecap]);
  const r = me ? recapCache[`${me.id}:day`] : undefined;
  const peak = useMemo(() => {
    const h = new Array(24).fill(0) as number[];
    for (const at of feed?.todayPlays || []) h[new Date(at).getHours()]++;
    const max = Math.max(...h);
    return max > 0 ? h.indexOf(max) : null;
  }, [feed?.todayPlays]);
  const peakLabel = peak != null ? new Date(2000, 0, 1, peak).toLocaleTimeString(toLocale(language), { hour: '2-digit', minute: '2-digit', hour12: me?.timeFormat === '12' }) : null;
  const rep = feed?.onRepeat;
  const num = (n: number) => new Intl.NumberFormat(toLocale(language)).format(n);
  const foot = [peakLabel && t('home.dayPeak', { time: peakLabel }), rep && t('home.onRepeat', { title: rep.title, n: rep.plays })].filter(Boolean).join(' · ');
  // The day's songs by plays, one cover per album.
  const covers: { key: string; cover: string | null; albumId: string | null; title: string; artist: string }[] = [];
  for (const s of r?.topSongs || []) {
    const key = s.albumId || s.cover || s.title;
    if (!covers.some((c) => c.key === key)) covers.push({ key, cover: s.cover, albumId: s.albumId, title: s.title, artist: s.artist });
  }
  return (
    // The day over its covers, blurred (the first one), white text.
    <div className={`tile day13${covers[0]?.cover ? ' bh15' : ''}`} style={blurStyle(covers[0]?.cover ? sizedImage(covers[0].cover, 150) ?? covers[0].cover : null)}>
      <div className="hd10"><h2 style={{ margin: 0 }}>{t('home.daySoFar')}</h2></div>
      {/* The same three numbers as the recap's strip. */}
      <div className="st15">
        <div><b>{num(r?.minutes ?? 0)}</b><small>{t('recap.minutesL')}</small></div>
        <div><b>{num(r?.uniqueArtists ?? 0)}</b><small>{t('recap.artistsL')}</small></div>
        <div><b>{num(r?.trackCount ?? 0)}</b><small>{t('recap.tracksL')}</small></div>
      </div>
      {covers.length > 0 && (
        <div className="hrow dcv15">
          {covers.map((c) => (
            <button key={c.key} onClick={() => c.albumId && openAlbum(c.albumId)} style={{ cursor: c.albumId ? 'pointer' : 'default' }} title={`${c.title} — ${c.artist}`}>
              <CoverArt url={c.cover ?? undefined} fallbackLetter={c.artist[0] || '?'} className="cov" px={120} style={{ width: '100%', aspectRatio: '1' }} />
              <small>{c.title}</small>
            </button>
          ))}
        </div>
      )}
      {foot && <small className="muted" style={{ fontWeight: 700, display: 'block', marginTop: 10 }}>{foot}</small>}
    </div>
  );
}

function RateTile() {
  const { t, myRatings, feed, openAlbum, spotifyCovers } = useApp();
  const rated = useMemo(() => new Set(myRatings.map((r) => r.albumId)), [myRatings]);
  const unrated = useAlbums((feed?.recentAlbumIds || []).filter((id) => !rated.has(id)).slice(0, 12));
  return (
    // No card of its own: the covers under it are the cards.
    <div className="sec rt16">
      <div className="hd10"><h2 style={{ margin: 0 }}>{t('home.rateWhatPlayed')}</h2></div>
      {unrated.length ? (
        <CoverWall row items={unrated.map(({ id, album }) => ({ key: id, cover: spotifyCovers[album.id] || album.cover, title: album.title, artist: album.artist, artistId: album.artistId, onClick: () => openAlbum(album.id) }))} />
      ) : <p className="muted">{t('home.rateWhatPlayedEmpty')}</p>}
    </div>
  );
}

// ----- Trending in your circle (rev 10/11) -----

// A shelf of covers: rank on the cover, the friends' average under it.
function TrendingSection() {
  const { t, feed, openAlbum, spotifyCovers } = useApp();
  const list = feed?.trending || [];
  const loaded = useAlbums(list.map((x) => x.albumId));
  // The same album rated under its catalog id and its Spotify id shows once.
  const seen = new Set<string>();
  const known = loaded.filter(({ album }) => { const k = `${album.title}|${album.artist}`.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
  if (!known.length) return null;
  return (
    <Shelf title={t('home.trendingTitle')}>
      {known.map(({ id, album }, i) => {
        const x = list.find((y) => y.albumId === id)!;
        return (
          <AlbumShelfCard key={id} cover={spotifyCovers[album.id] || album.cover} title={album.title} artist={album.artist} artistId={album.artistId}
            badge={`#${i + 1}`} meta={`★ ${fmt1(x.avg)} · ${t('home.trendingFriends', { n: x.count })}`} onClick={() => openAlbum(album.id)} />
        );
      })}
    </Shelf>
  );
}

// Your rating streak: days in a row you rated something, and a nudge when
// today doesn't count yet.
function StreakLine() {
  const { t, myRatings } = useApp();
  const { days, ratedToday } = useMemo(() => ratingStreak(myRatings.map((r) => r.createdAt), new Date().getTimezoneOffset()), [myRatings]);
  if (days < 1) return null;
  return (
    <p className={`stk19${ratedToday ? ' ok' : ''}`}>
      <i className="ic ic-flame" aria-hidden="true" />
      <b>{t('streak.days', { n: days })}</b>
      <span>{ratedToday ? t('streak.today') : t('streak.keep')}</span>
    </p>
  );
}

// December and January: the year in review, one tap from Home.
function YearCard() {
  const { t, openRecap } = useApp();
  return (
    <button className="tile yr19" onClick={() => openRecap('me', 'year')}>
      <span className="k">{t('recap.yearKicker')}</span>
      <b>{t('recap.yearTitle', { year: yearRecapYear() })}</b>
      <span className="op">{t('recap.friendOpen')} →</span>
    </button>
  );
}

export function HomeScreen(_props: { device: Device }) {
  const { t, me, setFeed, ensureRecap, recapCache } = useApp();
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
      {/* the page heading for screen readers (the hot take, when there is one, has its own) */}
      <h1 className="sr">{t('nav.home')}</h1>
      <div className="bento b3">
        <HeroTile wide={seen} />
        {!seen && <RecapCard r={r} week={week} />}
      </div>
      {seen && r && <RecapStrip r={r} week={week} />}
      {yearRecapOpen() && <YearCard />}
      <StreakLine />

      <ImportNudge />
      <RateQueueCard />

      <FeedSection />

      <FriendsList />

      <div className="sec two">
        <DayTile />
        <RateTile />
      </div>

      <FriendsPicksCard />
      <TrendingSection />
    </>
  );
}
