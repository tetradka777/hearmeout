'use client';

import { useEffect, useMemo, useState } from 'react';
import { useApp } from '@/lib/AppContext';
import { usePlayer, type QueueTrack } from '@/lib/PlayerContext';
import type { ApiUser, Device, SpotifyArtistAlbum } from '@/lib/types';
import type { ArtistTopTrack } from '@/lib/spotifyCatalog';
import { coverArtUrl } from '@/lib/musicbrainz';
import { regionDisplayName } from '@/lib/i18n';
import { CoverArt } from '../ui/CoverArt';
import { BookmarkIcon, HeartIcon, PlayIcon } from '../ui/Icons';
import { ArtistAvatar } from '../ui/ArtistAvatar';
import { Stars } from '../redesign/Stars';
import { userAvatarStyle } from '@/lib/format';

type ArtistTab = 'popular' | 'albums' | 'reviews' | 'concerts';
type FriendReview = { user: ApiUser; albumId: string; stars: number; review: string; createdAt: string };

function SpotifyAlbumCard({ album, fallbackLetter, onOpen, unreleasedLabel, score, scoreLabel }: {
  album: SpotifyArtistAlbum;
  fallbackLetter: string;
  onOpen: (id: string) => void;
  unreleasedLabel?: string;
  score?: number;
  scoreLabel?: string;
}) {
  return (
    <button className="cvw" onClick={() => onOpen(album.id)} style={{ textAlign: 'left', width: '100%' }}>
      <CoverArt url={album.cover ?? undefined} fallbackLetter={fallbackLetter} className={`cov${unreleasedLabel ? ' ann' : ''}`} style={{ width: '100%', aspectRatio: '1' }}>
        {score != null && <span className="bdg">{score.toFixed(1)}</span>}
      </CoverArt>
      <b style={{ display: 'block', marginTop: 10 }}>{album.title}</b>
      <small className="muted" style={{ fontWeight: unreleasedLabel ? 700 : 600 }}>
        {unreleasedLabel ?? `${album.year ?? '—'}${scoreLabel ? ` · ${scoreLabel}` : ''}`}
      </small>
    </button>
  );
}

function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// vArtist() in reference/app.js (spec 6.7 / 13.10): ink header with play,
// love and Follow, genre / community / top-fan chips, "You and …" and
// Community tiles, then the Popular / Albums / Reviews / Concerts tabs.
export function ArtistScreen({ device: _device }: { device: Device }) {
  const { t, language, state, me, albumRatings, myRatings, goBack, openAlbum, showToast, lovedItems, toggleLoved, viewFriend, laterItems, toggleLaterTrack } = useApp();
  const { playQueue, currentTrack, playing } = usePlayer();
  const art = state.currentArtist;
  const [resolvingGroup, setResolvingGroup] = useState<string | null>(null);
  const [tab, setTab] = useState<ArtistTab>('popular');
  const [following, setFollowing] = useState(false);
  const [topTracks, setTopTracks] = useState<ArtistTopTrack[] | null | 'error'>(null);
  const [reviews, setReviews] = useState<FriendReview[] | null>(null);
  const [topFan, setTopFan] = useState<{ id: string; name: string; handle: string; avatarUrl: string | null; hours: number } | null>(null);

  const isSpotify = art?.source === 'spotify';

  useEffect(() => { setTab('popular'); }, [art?.id]);

  useEffect(() => {
    if (!art || !isSpotify) { setTopFan(null); return; }
    let cancelled = false;
    setTopFan(null);
    fetch(`/api/artist/${art.id}/top-fan?name=${encodeURIComponent(art.name)}`)
      .then((r) => (r.ok ? r.json() : { topFan: null }))
      .then((d) => { if (!cancelled) setTopFan(d.topFan); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [art?.id, art?.name, isSpotify]);

  useEffect(() => {
    if (!art || !isSpotify || !me) { setFollowing(false); return; }
    let cancelled = false;
    fetch(`/api/artist/${art.id}/follow`).then((r) => (r.ok ? r.json() : { following: false })).then((d) => { if (!cancelled) setFollowing(!!d.following); });
    return () => { cancelled = true; };
  }, [art?.id, isSpotify, me]);

  useEffect(() => {
    if (!art || !isSpotify) { setTopTracks(null); return; }
    let cancelled = false;
    setTopTracks(null);
    const market = me?.region ? `?market=${encodeURIComponent(me.region)}` : '';
    fetch(`/api/artist/${art.id}/top-tracks${market}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled) setTopTracks(d ? d.tracks : 'error'); })
      .catch(() => { if (!cancelled) setTopTracks('error'); });
    return () => { cancelled = true; };
  }, [art?.id, isSpotify, me?.region]);

  const albumIdsKey = (art?.releasedAlbums || []).map((al) => al.id).join(',');
  useEffect(() => {
    if (!art || !isSpotify || !albumIdsKey) { setReviews(null); return; }
    let cancelled = false;
    setReviews(null);
    fetch(`/api/artist/${art.id}/reviews?albums=${encodeURIComponent(albumIdsKey)}`)
      .then((r) => (r.ok ? r.json() : { reviews: [] }))
      .then((d) => { if (!cancelled) setReviews(d.reviews); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [art?.id, isSpotify, albumIdsKey]);

  const openMbGroup = async (title: string, artistName: string, groupId: string) => {
    if (resolvingGroup) return;
    setResolvingGroup(groupId);
    try {
      const res = await fetch(`/api/spotify/resolve-album?title=${encodeURIComponent(title)}&artist=${encodeURIComponent(artistName)}`);
      if (!res.ok) { showToast(t('toast.albumOpenFailed')); return; }
      const { id } = await res.json();
      openAlbum(id);
    } catch {
      showToast(t('toast.albumOpenFailed'));
    } finally {
      setResolvingGroup(null);
    }
  };

  const communityScore = useMemo(() => {
    if (!art?.releasedAlbums) return null;
    let sum = 0, ratingsCount = 0, albumsWithRatings = 0;
    for (const al of art.releasedAlbums) {
      const info = albumRatings[al.id];
      if (info) { sum += info.avg * info.count; ratingsCount += info.count; albumsWithRatings++; }
    }
    if (!ratingsCount) return null;
    return { avg: sum / ratingsCount, count: ratingsCount, albumsWithRatings };
  }, [art, albumRatings]);

  const myScoreByAlbum = useMemo(() => new Map(myRatings.map((r) => [r.albumId, r.stars] as const)), [myRatings]);

  const yourStats = useMemo(() => {
    if (!art?.releasedAlbums) return null;
    const ids = new Set(art.releasedAlbums.map((al) => al.id));
    const mine = myRatings.filter((r) => ids.has(r.albumId));
    if (!mine.length) return null;
    const top = [...mine].sort((a, b) => b.stars - a.stars)[0];
    const topAlbum = art.releasedAlbums.find((al) => al.id === top.albumId) ?? null;
    return { count: mine.length, avg: mine.reduce((s, r) => s + r.stars, 0) / mine.length, best: topAlbum, bestScore: top.stars };
  }, [art, myRatings]);

  if (!art) {
    return (
      <>
        <button className="crumb" onClick={() => goBack('catalog')}>‹ {t('artist.back')}</button>
        <div className="tile empty"><p>{t('artist.notSelected')}</p></div>
      </>
    );
  }

  const isLoved = lovedItems.some((li) => li.type === 'artist' && li.title === art.name);

  if (isSpotify) {
    const tracks = Array.isArray(topTracks) ? topTracks : [];
    const queue: QueueTrack[] = tracks.map((tr) => ({ title: tr.title, artist: art.name, cover: tr.albumCover, albumId: tr.albumId, spotifyId: tr.albumId }));

    const toggleFollow = async () => {
      const next = !following;
      setFollowing(next);
      const res = await fetch(`/api/artist/${art.id}/follow`, next
        ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: art.name }) }
        : { method: 'DELETE' });
      if (!res.ok) { setFollowing(!next); showToast(t('artist.followFailed')); return; }
      showToast(t(next ? 'artist.followedToast' : 'artist.unfollowedToast', { name: art.name }));
    };

    let body;
    if (art.loading) {
      body = <p className="muted">{t('artist.loadingAlbums')}</p>;
    } else if (art.error) {
      body = <div className="tile empty"><p>{art.error}</p></div>;
    } else if (tab === 'popular') {
      body = (
        <div className="tile">
          {topTracks === null ? <p className="muted">{t('artist.popularLoading')}</p>
            : !tracks.length ? <p className="muted">{t('artist.popularEmpty')}</p>
            : tracks.map((tr, i) => {
              const score = myScoreByAlbum.get(tr.albumId);
              const trackIndex = tr.trackNumber - 1;
              const saved = laterItems.some((li) => li.type === 'track' && li.albumId === tr.albumId && li.trackIndex === trackIndex);
              const isCur = currentTrack?.albumId === tr.albumId && currentTrack?.title === tr.title;
              return (
                <div className="row" key={tr.id}>
                  <span className="num" style={{ fontSize: 22, width: 20, opacity: 0.8 }}>{i + 1}</span>
                  <button className="g rowlink" onClick={() => openAlbum(tr.albumId)} style={{ textAlign: 'left' }}>
                    <b>{tr.title}</b>
                    <small className="muted" style={{ fontWeight: 600 }}>{formatDuration(tr.durationMs)} · {tr.albumTitle}</small>
                  </button>
                  {score != null
                    ? <span className="tag" style={{ background: 'var(--acc)', color: 'var(--onacc)' }}>{t('artist.youScore', { score: score.toFixed(1) })}</span>
                    : <span className="tag">{t('artist.notRated')}</span>}
                  <button
                    className={`ib love${saved ? ' on' : ''}`}
                    aria-pressed={saved}
                    aria-label={saved ? t('track.removeLater') : t('track.saveLater')}
                    onClick={() => toggleLaterTrack(tr.albumId, trackIndex, tr.title, art.name, tr.albumCover)}
                  >
                    <BookmarkIcon />
                  </button>
                  <button className="ib" onClick={() => playQueue(queue, i)} aria-label={t('album.playPreviewOf', { title: tr.title })}>
                    {isCur && playing ? <span className="eq"><b /><b /><b /></span> : <PlayIcon size={14} />}
                  </button>
                </div>
              );
            })}
        </div>
      );
    } else if (tab === 'albums') {
      body = (
        <>
          <h3 style={{ marginBottom: 10 }}>{t('artist.released')}</h3>
          {art.releasedAlbums?.length ? (
            <div className="cgrid">
              {art.releasedAlbums.map((al) => {
                const mine = myScoreByAlbum.get(al.id);
                const community = albumRatings[al.id]?.avg;
                return (
                  <SpotifyAlbumCard
                    key={al.id}
                    album={al}
                    fallbackLetter={art.name[0] || '?'}
                    onOpen={openAlbum}
                    score={mine ?? community}
                    scoreLabel={mine != null ? t('artist.yourScoreLabel') : community != null ? t('artist.communityScoreLabel') : undefined}
                  />
                );
              })}
            </div>
          ) : <p className="muted">{t('artist.notFound')}</p>}
          {!!art.upcomingAlbums?.length && (
            <>
              <h3 style={{ margin: '26px 0 10px' }}>{t('artist.announced')}</h3>
              <div className="cgrid">
                {art.upcomingAlbums.map((al) => (
                  <SpotifyAlbumCard key={al.id} album={al} fallbackLetter={art.name[0] || '?'} onOpen={openAlbum} unreleasedLabel={t('artist.unreleased')} />
                ))}
              </div>
            </>
          )}
        </>
      );
    } else if (tab === 'reviews') {
      body = (
        <div className="stack">
          {communityScore && (
            <div className="tile t-pop">
              <span className="num" style={{ fontSize: 64 }}>{communityScore.avg.toFixed(1)}</span>
              <p style={{ fontWeight: 800, marginTop: 6 }}>{t('artist.communityTile', { count: communityScore.count })}</p>
            </div>
          )}
          {reviews === null ? <p className="muted">{t('artist.loadingAlbums')}</p>
            : !reviews.length ? <div className="tile t-soft2"><p className="muted" style={{ fontWeight: 600 }}>{t('artist.reviewsEmpty')}</p></div>
            : reviews.map((rv, i) => {
              const album = art.releasedAlbums?.find((al) => al.id === rv.albumId);
              return (
                <div className={`tile${i % 2 === 0 ? ' t-soft2' : ''}`} key={`${rv.user.id}-${rv.albumId}`}>
                  <button className="who" onClick={() => viewFriend(rv.user.id)} style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 800, marginBottom: 8 }}>
                    <span className="dot" style={{ ...userAvatarStyle(rv.user), width: 28, height: 28, fontSize: 12 }}>{rv.user.name[0]}</span>
                    {rv.user.name} <Stars value={rv.stars} size={14} />
                  </button>
                  <p className="quote" style={{ fontSize: 19 }}>“{rv.review}”</p>
                  {album && <button className="link" onClick={() => openAlbum(album.id)} style={{ marginTop: 8 }}>{album.title}</button>}
                </div>
              );
            })}
        </div>
      );
    } else {
      // Concerts: there's no concert-listing data source behind the app
      // yet, so this tab is honest about it and hands off to a ticket
      // search for the artist instead of showing invented dates.
      const region = me?.region ? regionDisplayName(me.region, language) : null;
      body = (
        <div className="tile">
          <p className="muted" style={{ fontWeight: 600, marginBottom: 6 }}>
            {region ? t('artist.concertsNote', { region }) : t('artist.concertsNoRegion')}
          </p>
          <div className="row">
            <span className="g"><b>{art.name}</b><small className="muted" style={{ fontWeight: 600 }}>{t('artist.concertsEmpty')}</small></span>
            <a className="btn ghost" href={`https://www.songkick.com/search?query=${encodeURIComponent(art.name)}&type=artists`} target="_blank" rel="noreferrer">{t('artist.findTickets')}</a>
          </div>
        </div>
      );
    }

    const TABS: { key: ArtistTab; label: string }[] = [
      { key: 'popular', label: t('artist.tabPopular') },
      { key: 'albums', label: t('artist.tabAlbums') },
      { key: 'reviews', label: t('artist.tabReviews') },
      { key: 'concerts', label: t('artist.tabConcerts') },
    ];

    return (
      <>
        <button className="crumb" onClick={() => goBack('catalog')}>‹ {t('artist.back')}</button>
        <div className="tile t-ink glow" style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
          <CoverArt url={art.photo ?? undefined} fallbackLetter={art.name[0] || '?'} className="ph" />
          <div style={{ flex: 1, minWidth: 200 }}>
            <p className="eyebrow muted" style={{ margin: 0 }}>{t('artist.subtitleSpotify')}</p>
            <h1 className="big" style={{ margin: 0, fontSize: 'clamp(34px,7vw,60px)' }}>{art.name}</h1>
            {(art.followers != null || art.popularity != null) && (
              <p className="muted" style={{ fontWeight: 600, marginTop: 4 }}>
                {art.followers != null && t('artist.followersCount', { count: art.followers.toLocaleString(language) })}
                {art.followers != null && art.popularity != null && ' · '}
                {art.popularity != null && t('artist.popularityScore', { score: art.popularity })}
              </p>
            )}
            <div className="chips" style={{ margin: '10px 0 0' }}>
              {(art.genres || []).map((g) => <span className="chip on" key={g} style={{ fontSize: 13, padding: '5px 12px' }}>{g}</span>)}
              {communityScore && (
                <span className="chip" style={{ fontSize: 13, padding: '5px 12px' }}>
                  <Stars value={communityScore.avg} size={12} onDark /> {t('artist.communityChip', { avg: communityScore.avg.toFixed(1) })}
                </span>
              )}
              {topFan && (
                <button className="chip" onClick={() => viewFriend(topFan.id)} style={{ fontSize: 13, padding: '5px 12px' }}>
                  {t('artist.topFanChip', { name: topFan.name, hours: topFan.hours })}
                </button>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="play" disabled={!queue.length} onClick={() => queue.length && playQueue(queue, 0)} aria-label={t('artist.playTop')}><PlayIcon size={18} /></button>
            <button className={`btn ghost love${isLoved ? ' on' : ''}`} aria-pressed={isLoved} onClick={() => toggleLoved('artist', art.name, null, art.id, art.photo ?? null)}>
              <HeartIcon /> {isLoved ? t('artist.loved') : t('artist.love')}
            </button>
            <button className={`btn lg${following ? '' : ' ghost'}`} aria-pressed={following} onClick={toggleFollow}>
              {following ? t('artist.following') : t('artist.follow')}
            </button>
          </div>
        </div>

        <div className="bento" style={{ margin: '14px 0' }}>
          <div className="tile t-soft2">
            <h3 style={{ marginBottom: 8 }}>{t('artist.yourAndArtist')}</h3>
            {yourStats ? (
              <>
                <div className="vsline">
                  <div><span className="num" style={{ fontSize: 40 }}>{yourStats.count}</span><br /><small style={{ fontWeight: 700 }}>{t('artist.yourRatedCount')}</small></div>
                  <div><span className="num" style={{ fontSize: 40 }}>{yourStats.avg.toFixed(1)}</span><br /><small style={{ fontWeight: 700 }}>{t('artist.yourAverage')}</small></div>
                </div>
                {yourStats.best && (
                  <button className="row" onClick={() => openAlbum(yourStats.best!.id)} style={{ marginTop: 8 }}>
                    <CoverArt url={yourStats.best.cover ?? undefined} fallbackLetter={art.name[0] || '?'} className="cov" style={{ width: 44, height: 44 }} />
                    <span className="g"><b>{t('artist.yourBest')}</b><small className="muted" style={{ fontWeight: 600 }}>{yourStats.best.title}</small></span>
                    <span className="num" style={{ fontSize: 26, color: 'var(--acct)' }}>{yourStats.bestScore.toFixed(1)}</span>
                  </button>
                )}
              </>
            ) : <p className="muted" style={{ fontWeight: 600 }}>{t('artist.noneRated')}</p>}
          </div>
          {communityScore && (
            <div className="tile t-pop">
              <h3 style={{ marginBottom: 6 }}>{t('artist.community')}</h3>
              <span className="num" style={{ fontSize: 48 }}>{communityScore.avg.toFixed(1)}</span>
              <p style={{ fontWeight: 700 }}>{t('artist.communityAcrossAlbums', { count: communityScore.count, albums: communityScore.albumsWithRatings })}</p>
            </div>
          )}
        </div>

        <div className="chips" style={{ margin: '18px 0' }} role="tablist">
          {TABS.map((tb) => (
            <button key={tb.key} role="tab" aria-selected={tab === tb.key} className={`chip${tab === tb.key ? ' on' : ''}`} onClick={() => setTab(tb.key)}>{tb.label}</button>
          ))}
        </div>
        {body}
      </>
    );
  }

  // Open-library (MusicBrainz) fallback, spec 13.10: simple grid, no
  // ratings, genres or top fan.
  let body;
  if (art.loading) {
    body = <p className="muted">{t('artist.loadingAlbums')}</p>;
  } else if (art.error) {
    body = <div className="tile empty"><p>{art.error}</p></div>;
  } else if (!art.albums || !art.albums.length) {
    body = <div className="tile empty"><p>{t('artist.notFound')}</p></div>;
  } else {
    body = (
      <div className="sec">
        <h2>{t('artist.albums')}</h2>
        <div className="cgrid">
          {art.albums.map((g) => {
            const year = g['first-release-date'] ? g['first-release-date'].slice(0, 4) : '—';
            const cover = coverArtUrl(g.id);
            return (
              <button className="cvw" key={g.id} onClick={() => openMbGroup(g.title, art.name, g.id)} style={{ textAlign: 'left', width: '100%', opacity: resolvingGroup === g.id ? 0.6 : 1 }}>
                <CoverArt url={cover} fallbackLetter={art.name[0] || '?'} className="cov" style={{ width: '100%', aspectRatio: '1' }} />
                <div style={{ marginTop: 8 }}><b>{g.title}</b><div className="muted">{year}</div></div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <>
      <button className="crumb" onClick={() => goBack('catalog')}>‹ {t('artist.back')}</button>
      <div className="tile t-ink hero">
        <ArtistAvatar name={art.name} className="ph" fallbackStyle={{ fontSize: 32 }} />
        <h1 style={{ marginTop: 14 }}>{art.name}</h1>
        <p className="muted">{t('artist.subtitle')}</p>
        <div className="acts">
          <button className={`btn ghost love${isLoved ? ' on' : ''}`} onClick={() => toggleLoved('artist', art.name, null, art.id, null)}>
            <HeartIcon /> {isLoved ? t('artist.loved') : t('artist.love')}
          </button>
        </div>
      </div>
      {body}
    </>
  );
}
