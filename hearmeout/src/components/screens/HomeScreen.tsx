'use client';

import { useEffect, useMemo, useState } from 'react';
import { useApp } from '@/lib/AppContext';
import type { Device, FeedEvent, FeedResponse, PublicProfile } from '@/lib/types';
import { CoverArt } from '../ui/CoverArt';
import { userAvatarStyle, formatRelative } from '@/lib/format';
import { computeMatch } from '@/lib/matchScore';
import { FriendsRow } from '../FriendsRow';
import { OnThisDayTeaser } from './OnThisDayTeaser';
import { StarIcon } from '../ui/Icons';
import { toLocale } from '@/lib/i18n';

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
  const { t, feed, openAlbum, viewFriend } = useApp();
  const hero = feed?.hero || null;
  const album = useAlbum(hero?.albumId || null);

  if (!hero || !album) {
    return (
      <div className="tile t-ink hero s2">
        <span className="pill">{t('home.heroSticker')}</span>
        <h1>{t('home.heroEmptyTitle')}</h1>
        <p className="muted">{t('home.heroEmptySub')}</p>
      </div>
    );
  }

  return (
    <div className="tile t-ink hero s2">
      <span className="pill">{t('home.heroSticker')}</span>
      <h1>{t('home.heroHeadline', { friend: hero.friend.name, album: album.title, theirScore: hero.theirs.toFixed(1), mine: hero.mine.toFixed(1) })}</h1>
      <div className="duel">
        <div className="bub b-ac"><span className="num">{hero.mine.toFixed(1)}</span><span className="w">you</span></div>
        <div className="bub b-pop r"><span className="num">{hero.theirs.toFixed(1)}</span><span className="w">{hero.friend.name}</span></div>
      </div>
      <div className="acts">
        <button className="btn" onClick={() => openAlbum(album.id)}>{t('home.defendRating')}</button>
        <button className="btn ghost" onClick={() => viewFriend(hero.friend.id)}>{t('home.compareWith', { friend: hero.friend.name })}</button>
      </div>
    </div>
  );
}

function RecapTile() {
  const { me, t, language, ensureRecap, recapCache, openRecap } = useApp();
  useEffect(() => { if (me) ensureRecap('me', 'day'); }, [me, ensureRecap]);
  if (!me) return null;
  const r = recapCache['me:day'];
  return (
    <button className="tile t-ac" style={{ textAlign: 'left', width: '100%' }} onClick={() => openRecap('me')}>
      <div className="eyebrow">{t('recapTeaser.title')}</div>
      {r && r.topArtists[0] ? (
        <>
          <h3>{r.topArtists[0].name}</h3>
          <p>{r.minutes} {t('awards.minutesShort')}</p>
        </>
      ) : (
        <p>{t('recapTeaser.notYet')}</p>
      )}
    </button>
  );
}

function FeedTile({ event }: { event: FeedEvent }) {
  const { t, language, openAlbum } = useApp();
  const albumId = event.type === 'rating_review' ? event.albumId : null;
  const album = useAlbum(albumId);

  if (event.type === 'session') {
    return (
      <div className="tile">
        <div className="ft top">
          <div className="dot">{'\u{1F3A7}'}</div>
          <div className="who"><b>you</b></div>
        </div>
        <p>{event.plays} plays · {event.minutes} min today</p>
      </div>
    );
  }

  if (event.type === 'first_play') {
    return (
      <div className="tile">
        <div className="ft top">
          <div className="dot" style={userAvatarStyle(event.user)}>{event.user.name[0]}</div>
          <div className="who"><b>{event.user.name}</b><span className="tag">{t('home.firstPlayTag')}</span></div>
        </div>
        <h3>{event.trackTitle}</h3>
        <p className="muted">{event.artist} · {formatRelative(event.at, language)}</p>
      </div>
    );
  }

  // rating_review
  if (!album) return null;
  return (
    <div className="tile" onClick={() => openAlbum(album.id)} style={{ cursor: 'pointer' }}>
      <div className="ft top">
        <div className="dot" style={userAvatarStyle(event.user)}>{event.user.name[0]}</div>
        <div className="who"><b>{event.user.name}</b><span className="tag">{t('home.filterRated')}</span></div>
      </div>
      <span className="bigscore">{event.stars.toFixed(1)}</span>
      <div className="quote">&ldquo;{event.review}&rdquo;</div>
      <p className="muted">{album.title} — {album.artist}</p>
    </div>
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
      <div className="eyebrow">{t('home.feedLive', { date: today })}</div>
      <h2>{t('home.feedTitle')}</h2>
      <div className="chips">
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
        <div className="tile empty">
          <p>{t('home.feedEmpty')}</p>
        </div>
      )}
    </div>
  );
}

function DaySoFarTile() {
  const { me, t, ensureRecap, recapCache } = useApp();
  useEffect(() => { if (me) ensureRecap('me', 'day'); }, [me, ensureRecap]);
  const r = recapCache['me:day'];
  return (
    <div className="tile">
      <h3>{t('home.daySoFar')}</h3>
      <div className="stats3">
        <div><span className="num">{r?.trackCount ?? 0}</span><small>tracks</small></div>
        <div><span className="num">{r?.minutes ?? 0}</span><small>min</small></div>
        <div><span className="num">{r?.uniqueArtists ?? 0}</span><small>artists</small></div>
      </div>
    </div>
  );
}

function TasteMatchTile() {
  const { t, me, viewFriend } = useApp();
  const [scores, setScores] = useState<Record<string, number | null>>({});

  useEffect(() => {
    if (!me || !me.friends.length) return;
    let cancelled = false;
    Promise.all(
      me.friends.slice(0, 6).map(async (f) => {
        const res = await fetch(`/api/users/${f.id}`);
        if (!res.ok) return [f.id, null] as const;
        const profile: PublicProfile = await res.json();
        return [f.id, computeMatch(me.genres, profile.genres)] as const;
      })
    ).then((pairs) => { if (!cancelled) setScores(Object.fromEntries(pairs)); });
    return () => { cancelled = true; };
  }, [me]);

  if (!me) return null;
  const top = [...me.friends].sort((a, b) => (scores[b.id] ?? -1) - (scores[a.id] ?? -1)).slice(0, 3);

  return (
    <div className="tile">
      <h3>{t('home.tasteMatchTitle')}</h3>
      {top.length ? top.map((f) => (
        <button key={f.id} className="row" onClick={() => viewFriend(f.id)} style={{ cursor: 'pointer' }}>
          <div className="dot" style={userAvatarStyle(f)}>{f.name[0]}</div>
          <div className="g"><b>{f.name}</b></div>
          <span className="num" style={{ fontSize: 20 }}>{scores[f.id] != null ? `${scores[f.id]}%` : '—'}</span>
        </button>
      )) : <p className="muted">{t('friends.empty')}</p>}
    </div>
  );
}

function RateWhatPlayedRow({ albumId }: { albumId: string }) {
  const { openAlbum } = useApp();
  const album = useAlbum(albumId);
  if (!album) return null;
  return (
    <button className="row" onClick={() => openAlbum(album.id)} style={{ cursor: 'pointer' }}>
      <CoverArt url={album.cover} fallbackLetter={album.artist[0] || '?'} className="cov" style={{ width: 44, height: 44 }} />
      <div className="g"><b>{album.title}</b><div className="muted">{album.artist}</div></div>
      <StarIcon />
    </button>
  );
}

function RateWhatPlayedTile() {
  const { t, myRatings, feed } = useApp();
  const rated = useMemo(() => new Set(myRatings.map((r) => r.albumId)), [myRatings]);
  const unrated = (feed?.recentAlbumIds || []).filter((id) => !rated.has(id)).slice(0, 4);

  return (
    <div className="tile">
      <h3>{t('home.rateWhatPlayed')}</h3>
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
        <OnThisDayTeaser />
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
