'use client';

import { useEffect, useMemo, useState } from 'react';
import { fmt1 } from '@/lib/numberFormat';
import { useApp } from '@/lib/AppContext';
import type { Device, FeedEvent, FeedResponse } from '@/lib/types';
import { CoverArt } from '../ui/CoverArt';
import { userAvatarStyle, formatRelative } from '@/lib/format';
import { FriendsRow } from '../FriendsRow';
import { Stars } from '../redesign/Stars';
import { MascotIcon } from '../redesign/icons';
import { MATCH_FRIEND_EVENT } from '@/lib/uiEvents';
import { useFriendScores } from '@/lib/useFriendScores';
import { toLocale, quoted } from '@/lib/i18n';
import { recapLine } from '@/lib/recapLine';
import { completedWeekRange, isoWeekNumber } from '@/lib/weeks';

// Home feed (redesign spec 6.1). Replaces the old Home = catalog-browser
// screen; browsing the catalog moved to Discover (spec 13.3). Real data
// from /api/feed (spec 8); album/track metadata resolved client-side via
// the same convention the rest of the app uses for ratings.album_id.

function useAlbum(albumId: string | null) {
  const { albums, liveAlbums, ensureLiveAlbum } = useApp();
  useEffect(() => { if (albumId) ensureLiveAlbum(albumId); }, [albumId, ensureLiveAlbum]);
  if (!albumId) return null;
  return liveAlbums[albumId] || albums.find((a) => a.id === albumId) || null;
}

function HeroTile() {
  const { t, feed, openAlbum, showScreen } = useApp();
  const openMatchWith = (friendId: string) => { showScreen('match'); window.dispatchEvent(new CustomEvent(MATCH_FRIEND_EVENT, { detail: friendId })); };
  const hero = feed?.hero || null;
  const album = useAlbum(hero?.albumId || null);

  if (!hero || !album) {
    return (
      <section className="tile t-ink hero glow s2">
        <span className="pill">{t('home.heroSticker')}</span>
        <h1>{t('home.heroEmptyTitle')}</h1>
        <p className="muted">{t('home.heroEmptySub')}</p>
      </section>
    );
  }

  return (
    <section className="tile t-ink hero glow s2">
      <span className="pill">{t('home.heroSticker')}</span>
      <h1>{t('home.heroHeadline', { friend: hero.friend.name, album: album.title, theirScore: fmt1(hero.theirs), mine: fmt1(hero.mine) })}</h1>
      <div className="duel">
        <div className="bub b-ac"><span className="num">{fmt1(hero.mine)}</span><span className="w">{t('friend.you')}</span></div>
        <div className="bub b-pop r"><span className="num">{fmt1(hero.theirs)}</span><span className="w">{hero.friend.name}</span></div>
      </div>
      <div className="acts">
        {/* Prototype: "Defend your rating" opens Rate with the review box focused. */}
        <button className="btn lg" onClick={() => { openAlbum(album.id); setTimeout(() => document.getElementById('rv')?.focus(), 80); }}>{t('home.defendRating')}</button>
        <button className="btn ghost lg" onClick={() => openMatchWith(hero.friend.id)}>{t('home.compareWith', { friend: hero.friend.name })}</button>
      </div>
    </section>
  );
}

// Spec 6.12: the Home recap tile opens the weekly recap — "your recap ·
// week N", the week's generated line, "Open your recap".
function RecapTile() {
  const { me, t, language, ensureRecap, recapCache, openRecap } = useApp();
  useEffect(() => { if (me) ensureRecap('me', 'week'); }, [me, ensureRecap]);
  if (!me) return null;
  const r = recapCache[`${me.id}:week`];
  const line = r ? recapLine(r, language, t) : null;
  return (
    // Prototype recap tile: a column of three lines — label, the week's line
    // in the display face, and the open link.
    <button className="tile t-ac" onClick={() => openRecap('me', 'week')} style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: 250, gap: 20 }}>
      <span style={{ fontWeight: 800 }}>{t('recapTeaser.weekEyebrow', { n: isoWeekNumber(completedWeekRange(0, me.weekStart).start) })}</span>
      {r && r.trackCount > 0 && line ? (
        <span className="disp" style={{ fontSize: 'clamp(28px,3.4vw,38px)', lineHeight: 0.98, fontWeight: 800, letterSpacing: '-.045em' }}>
          {quoted(language, `${line.lead}${line.em ? ` ${line.em}` : ''}`)}
        </span>
      ) : (
        // No plays this week yet: a plain empty state, not a giant quote.
        <span style={{ fontWeight: 700, fontSize: 17 }}>{t('recap.emptyTeaser')}</span>
      )}
      <span style={{ fontWeight: 800 }}>{t('recapTeaser.open')} →</span>
    </button>
  );
}

// Your corner: the number big, the unit small and spaced ("0 мин", "3 ч 12").
function minutesBig(min: number, t: (k: 'unit.h' | 'unit.m') => string) {
  const unit = (u: string) => <small style={{ fontSize: '0.4em', marginLeft: '0.15em' }}>{u}</small>;
  if (min < 60) return <>{min}{unit(t('unit.m'))}</>;
  return <>{Math.floor(min / 60)}{unit(t('unit.h'))}{String(min % 60).padStart(2, '0')}</>;
}

function minutesLabel(min: number, t: (k: 'unit.h' | 'unit.m') => string): string {
  return min >= 60 ? `${Math.floor(min / 60)}${t('unit.h')}${String(min % 60).padStart(2, '0')}` : `${min}${t('unit.m')}`;
}

// Feed tiles follow the prototype's ev1 / ev2 / ev3: cover + who line + tag
// + time on top, a headline, a detail line and the actions. (The
// prototype's "reply" / "+ react" need comments and reactions, which the
// product doesn't have, so only the actions that do something are shown.)
function FeedTile({ event }: { event: FeedEvent }) {
  const { t, language, openAlbum, spotifyCovers } = useApp();
  const albumId = event.type === 'rating_review' ? event.albumId : event.albumId;
  const album = useAlbum(albumId);
  const time = <span className="muted" style={{ fontSize: 13, fontWeight: 600 }}>{formatRelative(event.at, language)}</span>;
  const cover = (album && (spotifyCovers[album.id] || album.cover)) || (event.type !== 'rating_review' ? event.cover : null) || undefined;

  if (event.type === 'session') {
    return (
      <article className="tile ft t-soft2">
        <div className="top">
          <CoverArt url={cover} fallbackLetter="♪" className="cov" style={{ width: 88, height: 88 }} />
          <div>
            <div className="who"><span className="dot">{t('friend.you')[0]}</span>{t('friend.you')}</div>
            <span className="tag">{t('home.playsTag', { n: event.plays })}</span> {time}
          </div>
        </div>
        <h3 style={{ marginTop: 16 }}>{t('home.sessionTitle', { time: minutesLabel(event.minutes, t) })}</h3>
        <p className="muted" style={{ marginTop: 4 }}>{t('home.sessionSub', { artists: event.artists, tracks: event.plays })}</p>
        {event.albumId && <div className="acts"><button className="btn ghost" onClick={() => openAlbum(event.albumId!)}>{t('home.openSession')}</button></div>}
      </article>
    );
  }

  if (event.type === 'first_play') {
    return (
      <article className="tile ft t-pop">
        <div className="top">
          <CoverArt url={cover} fallbackLetter={event.artist[0] || '?'} className="cov" style={{ width: 88, height: 88 }} />
          <div>
            <div className="who"><span className="dot" style={userAvatarStyle(event.user)}>{event.user.name[0]}</span>{event.user.name}</div>
            <span className="tag">{t('home.firstPlayTag')}</span> {time}
          </div>
        </div>
        <h3 style={{ marginTop: 16 }}>{event.trackTitle}</h3>
        <p className="muted" style={{ marginTop: 4 }}>{event.artist}{album ? ` · ${album.title}` : ''}</p>
        {event.albumId && <div className="acts"><button className="btn" onClick={() => openAlbum(event.albumId!)}>{t('home.rateIt')}</button></div>}
      </article>
    );
  }

  // rating_review
  if (!album) return null;
  return (
    <article className="tile ft">
      <div className="who"><span className="dot" style={userAvatarStyle(event.user)}>{event.user.name[0]}</span>{event.user.name} <span className="tag">{t('home.filterRated')}</span> {time}</div>
      <span className="num bigscore">{fmt1(event.stars)}</span>
      <p className="quote">{quoted(language, event.review)}</p>
      <p className="muted" style={{ marginTop: 8, fontWeight: 600, fontSize: 14 }}>{t('home.albumBy', { album: album.title, artist: album.artist })}</p>
      <div className="acts"><button className="btn" onClick={() => openAlbum(album.id)}>{t('home.readReview')}</button></div>
    </article>
  );
}

type FeedFilter = 'all' | 'first_play' | 'rating_review' | 'session';

function FeedSection() {
  const { t, language, feed } = useApp();
  const [filter, setFilter] = useState<FeedFilter>('all');
  const events = feed?.events || [];
  const filtered = filter === 'all' ? events : events.filter((e) => e.type === filter);
  const today = new Date().toLocaleDateString(toLocale(language), { weekday: 'short', day: '2-digit', month: 'short' });

  return (
    <div className="sec">
      <p className="eyebrow muted">{t('home.feedLive', { date: today }).toLowerCase()}</p>
      <h2>{t('home.feedTitle')}</h2>
      <div className="chips" role="group" aria-label={t('home.feedTitle')}>
        <button className={`chip ${filter === 'all' ? 'on' : ''}`} onClick={() => setFilter('all')}>{t('home.filterAll')}</button>
        <button className={`chip ${filter === 'first_play' ? 'on' : ''}`} onClick={() => setFilter('first_play')}>{t('home.filterFirstPlays')}</button>
        <button className={`chip ${filter === 'rating_review' ? 'on' : ''}`} onClick={() => setFilter('rating_review')}>{t('home.filterRated')}</button>
        <button className={`chip ${filter === 'session' ? 'on' : ''}`} onClick={() => setFilter('session')}>{t('home.filterSession')}</button>
      </div>
      {filtered.length ? (
        <div className="bento b3">
          {filtered.map((e, i) => <FeedTile key={i} event={e} />)}
        </div>
      ) : (
        <div className="tile s2 empty">
          <MascotIcon />
          <p className="muted">{t('home.feedEmpty')}</p>
        </div>
      )}
    </div>
  );
}

function DaySoFarTile() {
  const { me, t, ensureRecap, recapCache } = useApp();
  useEffect(() => { if (me) ensureRecap('me', 'day'); }, [me, ensureRecap]);
  const r = me ? recapCache[`${me.id}:day`] : undefined;
  const big = { fontSize: 44, color: 'var(--acct)' } as const;
  return (
    <div className="tile">
      <p style={{ fontWeight: 800, marginBottom: 12 }}>{t('home.daySoFar')}</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
        <div><span className="num" style={big}>{r?.trackCount ?? 0}</span><br /><small className="muted" style={{ fontWeight: 700 }}>{t('home.cornerTracks')}</small></div>
        <div><span className="num" style={big}>{minutesBig(r?.minutes ?? 0, t)}</span><br /><small className="muted" style={{ fontWeight: 700 }}>{t('home.listened')}</small></div>
        <div><span className="num" style={big}>{r?.uniqueArtists ?? 0}</span><br /><small className="muted" style={{ fontWeight: 700 }}>{t('home.cornerArtists')}</small></div>
      </div>
    </div>
  );
}

// Prototype: pink tile, each row "N shared" (artists in common) and a big
// percentage; a row opens the Match comparison with that friend.
function TasteMatchTile() {
  const { t, me, showScreen } = useApp();
  const scores = useFriendScores(me);

  if (!me) return null;
  const top = [...me.friends].sort((a, b) => (scores[b.id]?.pct ?? -1) - (scores[a.id]?.pct ?? -1)).slice(0, 3);
  const open = (id: string) => { showScreen('match'); window.dispatchEvent(new CustomEvent(MATCH_FRIEND_EVENT, { detail: id })); };

  return (
    <div className="tile t-pop">
      <h3 style={{ marginBottom: 6 }}>{t('home.tasteMatchTitle')}</h3>
      {top.length ? top.map((f) => (
        <button key={f.id} className="row" onClick={() => open(f.id)}>
          <span className="dot" style={userAvatarStyle(f)}>{f.name[0]}</span>
          <span className="g"><b>{f.name}</b><small className="muted" style={{ fontWeight: 600 }}>{t('home.sharedArtists', { n: scores[f.id]?.shared ?? 0 })}</small></span>
          <span className="num" style={{ fontSize: 34 }}>{scores[f.id]?.pct != null ? `${scores[f.id]!.pct}%` : '—'}</span>
        </button>
      )) : <p className="muted">{t('friends.empty')}</p>}
    </div>
  );
}

function RateWhatPlayedRow({ albumId }: { albumId: string }) {
  const { openAlbum, spotifyCovers } = useApp();
  const album = useAlbum(albumId);
  if (!album) return null;
  return (
    <button className="row" onClick={() => openAlbum(album.id)}>
      <CoverArt url={spotifyCovers[album.id] || album.cover} fallbackLetter={album.artist[0] || '?'} className="cov" style={{ width: 46, height: 46 }} />
      <span className="g"><b>{album.title}</b><small className="muted" style={{ fontWeight: 600 }}>{album.artist}</small></span>
      <Stars value={0} size={13} />
    </button>
  );
}

function RateWhatPlayedTile() {
  const { t, myRatings, feed } = useApp();
  const rated = useMemo(() => new Set(myRatings.map((r) => r.albumId)), [myRatings]);
  const unrated = (feed?.recentAlbumIds || []).filter((id) => !rated.has(id)).slice(0, 4);

  return (
    <div className="tile">
      <h3 style={{ marginBottom: 6 }}>{t('home.rateWhatPlayed')}</h3>
      {unrated.length ? unrated.map((id) => <RateWhatPlayedRow key={id} albumId={id} />) : <p className="muted">{t('home.rateWhatPlayedEmpty')}</p>}
    </div>
  );
}

export function HomeScreen(_props: { device: Device }) {
  const { me, t, setFeed } = useApp();

  useEffect(() => {
    if (!me) return;
    let cancelled = false;
    fetch('/api/feed').then((r) => (r.ok ? r.json() : null)).then((d: FeedResponse | null) => { if (!cancelled) setFeed(d); });
    return () => { cancelled = true; };
  }, [me, setFeed]);

  if (!me) return null;

  return (
    <>
      <div className="bento b3">
        <HeroTile />
        <RecapTile />
      </div>

      <FeedSection />

      <FriendsRow />

      <div className="sec">
        <h2>{t('home.yourCorner')}</h2>
        <div className="bento b3">
          <DaySoFarTile />
          <TasteMatchTile />
          <RateWhatPlayedTile />
        </div>
      </div>
    </>
  );
}
