'use client';

import { useEffect, useMemo, useState } from 'react';
import { fmt1, fmtHours } from '@/lib/numberFormat';
import { useApp } from '@/lib/AppContext';
import { cachedJson } from '@/lib/cachedJson';
import { usePlayer, type QueueTrack } from '@/lib/PlayerContext';
import type { ApiUser, Device, SpotifyArtistAlbum } from '@/lib/types';
import type { ArtistTopTrack } from '@/lib/spotifyCatalog';
import type { Concert } from '@/lib/concerts';
import { coverArtUrl } from '@/lib/musicbrainz';
import { regionDisplayName, toLocale } from '@/lib/i18n';
import { CoverArt } from '../ui/CoverArt';
import { ReviewCard } from '../ui/SuperCards';
import { BookmarkIcon, HeartIcon, PlayIcon } from '../ui/Icons';
import { Stars } from '../redesign/Stars';
import { MascotIcon } from '../redesign/icons';
import { PersonCards, Phrase } from '../ui/Visual';

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
      <CoverArt url={album.cover ?? undefined} fallbackLetter={fallbackLetter} className={`cov${unreleasedLabel ? ' ann' : ''}`} px={170} style={{ width: '100%', aspectRatio: '1' }}>
        {score != null && <span className="bdg">{fmt1(score)}</span>}
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
  const { t, language, state, me, albumRatings, myRatings, goBack, openAlbum, openSpotifyArtist, showToast, lovedItems, toggleLoved, viewFriend, laterItems, toggleLaterTrack } = useApp();
  const { playQueue, currentTrack, playing } = usePlayer();
  const art = state.currentArtist;
  const [resolvingGroup, setResolvingGroup] = useState<string | null>(null);
  const [tab, setTab] = useState<ArtistTab>('popular');
  const [following, setFollowing] = useState(false);
  const [topTracks, setTopTracks] = useState<ArtistTopTrack[] | null | 'error'>(null);
  const [reviews, setReviews] = useState<FriendReview[] | null>(null);
  // null = not loaded; configured=false = no Ticketmaster key on the server.
  const [concerts, setConcerts] = useState<{ configured: boolean; list: Concert[] } | 'error' | null>(null);
  const [topFan, setTopFan] = useState<{ id: string; name: string; handle: string; avatarUrl: string | null; hours: number } | null>(null);
  const [fans, setFans] = useState<{ id: string; name: string; handle: string; avatarUrl: string | null; hours: number }[]>([]);

  const isSpotify = art?.source === 'spotify';

  useEffect(() => { setTab('popular'); }, [art?.id]);

  useEffect(() => {
    if (!art || !isSpotify) { setTopFan(null); setFans([]); return; }
    let cancelled = false;
    setTopFan(null);
    setFans([]);
    fetch(`/api/artist/${art.id}/top-fan?name=${encodeURIComponent(art.name)}`)
      .then((r) => (r.ok ? r.json() : { topFan: null }))
      .then((d) => { if (!cancelled) { setTopFan(d.topFan); setFans(d.fans || []); } });
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
    fetch(`/api/artist/${art.id}/top-tracks`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled) setTopTracks(d ? d.tracks : 'error'); })
      .catch(() => { if (!cancelled) setTopTracks('error'); });
    return () => { cancelled = true; };
  }, [art?.id, isSpotify]);

  // Concerts load lazily, the first time the tab is opened for this artist.
  useEffect(() => { setConcerts(null); }, [art?.id, me?.region]);
  useEffect(() => {
    if (!art || !isSpotify || tab !== 'concerts' || concerts !== null) return;
    let cancelled = false;
    const country = me?.region ? `&country=${encodeURIComponent(me.region)}` : '';
    fetch(`/api/artist/${art.id}/concerts?name=${encodeURIComponent(art.name)}${country}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled) setConcerts(d ? { configured: !!d.configured, list: d.concerts || [] } : 'error'); })
      .catch(() => { if (!cancelled) setConcerts('error'); });
    return () => { cancelled = true; };
  }, [art, isSpotify, tab, concerts, me?.region]);

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

    const lovedTrack = (title: string) => lovedItems.some((li) => li.type === 'track' && li.title === title && li.artist === art.name);

    const toggleFollow = async () => {
      const next = !following;
      setFollowing(next);
      const res = await fetch(`/api/artist/${art.id}/follow`, next
        ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: art.name }) }
        : { method: 'DELETE' });
      if (!res.ok) { setFollowing(!next); showToast(t('artist.followFailed')); return; }
      showToast(t(next ? 'artist.followedToast' : 'artist.unfollowedToast', { name: art.name }));
      cachedJson('/api/fanclubs', { force: true });
    };

    let body;
    if (art.loading) {
      body = <p className="muted">{t('artist.loadingAlbums')}</p>;
    } else if (art.error) {
      body = (
        <div className="tile t-soft2 empty">
          <MascotIcon />
          <h3>{art.error}</h3>
          <button className="btn" onClick={() => openSpotifyArtist(art.id, art.name, true)}>{t('states.errorCta')}</button>
        </div>
      );
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
                <div className="row poprow" key={tr.id}>
                  <span className="num" style={{ fontSize: 22, minWidth: 28, opacity: 0.8, whiteSpace: 'nowrap' }}>{i + 1}</span>
                  <button className="rowlink" onClick={() => openAlbum(tr.albumId)}>
                    <span className="g">
                      <b>{tr.title}</b>
                      <small className="muted" style={{ fontWeight: 600 }}>{formatDuration(tr.durationMs)} · {tr.albumTitle}</small>
                    </span>
                  </button>
                  {score != null
                    ? <span className="tag" style={{ background: 'var(--acc)', color: 'var(--onacc)' }}>{t('artist.youScore', { score: fmt1(score) })}</span>
                    : <span className="tag">{t('artist.notRated')}</span>}
                  <button
                    className={`ib love${lovedTrack(tr.title) ? ' on' : ''}`}
                    aria-pressed={lovedTrack(tr.title)}
                    aria-label={lovedTrack(tr.title) ? t('album.removeFromLoved') : t('album.addToLoved')}
                    onClick={() => toggleLoved('track', tr.title, art.name, tr.id, tr.albumCover)}
                  >
                    <HeartIcon />
                  </button>
                  <button
                    className={`ib love later${saved ? ' on' : ''}`}
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
          {reviews === null ? <p className="muted">{t('artist.loadingAlbums')}</p>
            : !reviews.length ? <div className="tile t-soft2"><p className="muted" style={{ fontWeight: 600 }}>{t('artist.reviewsEmpty')}</p></div>
            : reviews.map((rv) => (
              <ReviewCard key={`${rv.user.id}-${rv.albumId}`} user={rv.user} createdAt={rv.createdAt} stars={rv.stars} review={rv.review} albumId={rv.albumId} />
            ))}
        </div>
      );
    } else {
      // Concerts (Ticketmaster, lib/concerts.ts) worldwide, the account's
      // region first.
      // Without a TICKETMASTER_API_KEY on the server, or on an error, the tab
      // falls back to a ticket search for the artist — never invented dates.
      const region = me?.region ? regionDisplayName(me.region, language) : null;
      const searchLink = (
        <a className="btn ghost" href={`https://www.songkick.com/search?query=${encodeURIComponent(art.name)}&type=artists`} target="_blank" rel="noreferrer">{t('artist.findTickets')}</a>
      );
      const list = concerts && concerts !== 'error' && concerts.configured ? concerts.list : null;
      body = (
        <div className="tile">
          <p className="muted" style={{ fontWeight: 600, marginBottom: 6 }}>
            {region ? t('artist.concertsNote', { region }) : t('artist.concertsNoRegion')}
          </p>
          {concerts === null ? (
            <p className="muted">{t('artist.concertsLoading')}</p>
          ) : list && list.length ? (
            <div className="cdc15">
              {list.map((c) => {
                const d = new Date(`${c.date}T00:00:00Z`);
                const inner = (
                  <>
                    <span className="dt"><b>{d.toLocaleDateString(toLocale(language), { day: 'numeric', timeZone: 'UTC' })}</b><small>{d.toLocaleDateString(toLocale(language), { month: 'short', timeZone: 'UTC' })}</small></span>
                    <span className="g">
                      <b>{[c.city, c.country && c.country !== me?.region ? regionDisplayName(c.country, language) : null].filter(Boolean).join(', ') || c.name}</b>
                      <small>{[c.venue, c.time ? c.time.slice(0, 5) : null].filter(Boolean).join(' · ')}</small>
                    </span>
                  </>
                );
                return c.url
                  ? <a className="cd" key={c.id} href={c.url} target="_blank" rel="noreferrer">{inner}</a>
                  : <div className="cd" key={c.id}>{inner}</div>;
              })}
            </div>
          ) : (
            <div className="row">
              <span className="g">
                <b>{art.name}</b>
                <small className="muted" style={{ fontWeight: 600 }}>{list ? t('artist.concertsNoneAnywhere') : t('artist.concertsEmpty')}</small>
              </span>
              {searchLink}
            </div>
          )}
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
        <div className="tile t-ink glow" style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
          <CoverArt url={art.photo ?? undefined} fallbackLetter={art.name[0] || '?'} className="ph" />
          <div style={{ flex: 1, minWidth: 200 }}>
            <p className="eyebrow muted" style={{ margin: 0 }}>{t('artist.subtitleSpotify')}</p>
            <h1 className="big" style={{ margin: 0, fontSize: 'clamp(34px,7vw,60px)' }}>{art.name}</h1>
            {art.fans != null && art.fans > 0 && (
              <p className="muted" style={{ fontWeight: 600, marginTop: 4 }}>
                {t('artist.fansCount', { count: art.fans.toLocaleString(language) })}
              </p>
            )}
            <div className="chips" style={{ margin: '10px 0 0' }}>
              {(art.genres || []).map((g) => <span className="chip on" key={g} style={{ fontSize: 13, padding: '5px 12px' }}>{g}</span>)}
              {communityScore && (
                <span className="chip" style={{ fontSize: 13, padding: '5px 12px' }}>
                  <Stars value={communityScore.avg} size={12} onDark /> {t('artist.communityChip', { avg: fmt1(communityScore.avg) })}
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
            <button className={`btn ghost love${isLoved ? ' on' : ''}`} aria-pressed={isLoved} aria-label={isLoved ? t('album.removeFromLoved') : t('album.addToLoved')} onClick={() => toggleLoved('artist', art.name, null, art.id, art.photo ?? null)}>
              <HeartIcon />
            </button>
            <button className={`btn lg${following ? '' : ' ghost'}`} aria-pressed={following} onClick={toggleFollow}>
              {following ? t('artist.following') : t('artist.follow')}
            </button>
          </div>
        </div>

        {/* You and the artist, and everyone, as one phrase (no number tiles). */}
        {(yourStats || communityScore) && (
          <div style={{ margin: '14px 0 0' }}>
            <Phrase parts={[
              ...(yourStats ? [[yourStats.count, t('artist.yourRatedCount')], [`★ ${fmt1(yourStats.avg)}`, t('artist.yourAverage')]] as [string | number, string][] : []),
              ...(communityScore ? [[`★ ${fmt1(communityScore.avg)}`, t('artist.communityTile', { count: communityScore.count })]] as [string, string][] : []),
            ]} />
          </div>
        )}

        {/* Rev 9c: the albums shelf with scores, and friends who listen. */}
        {(art.releasedAlbums?.length || fans.length) ? (
          <div className="bento b3" style={{ margin: '14px 0' }}>
            {art.releasedAlbums?.length ? (
              <div className="tile s3 ash9">
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <h2 style={{ margin: 0 }}>{t('artist.albums')}</h2>
                  <small className="muted" style={{ fontWeight: 800 }}>{t('artist.albumsCount', { n: art.releasedAlbums.length })}</small>
                </div>
                <div className="hshelf9">
                  {art.releasedAlbums.slice(0, 6).map((al) => {
                    const mine = myScoreByAlbum.get(al.id);
                    const community = albumRatings[al.id]?.avg;
                    const score = mine ?? community;
                    return (
                      <button key={al.id} onClick={() => openAlbum(al.id)} style={{ textAlign: 'left' }}>
                        <div className="cvw">
                          <CoverArt url={al.cover ?? undefined} fallbackLetter={art.name[0] || '?'} className="cov" px={170} style={{ width: '100%', aspectRatio: '1' }} />
                          {score != null && <span className="bdg">{fmt1(score)}</span>}
                        </div>
                        <b>{al.title}</b>
                        <small className="muted" style={{ fontWeight: 600 }}>{al.year ?? '—'}{score != null ? ` · ${mine != null ? t('artist.yourScoreLabel') : t('artist.communityScoreLabel')}` : ''}</small>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
            {fans.length > 0 && (
              <div className="tile t-soft2 s3">
                <h2>{t('artist.friendsWhoListen', { name: art.name })}</h2>
                <PersonCards people={fans.map((f) => ({ id: f.id, name: f.name, avatarUrl: f.avatarUrl, value: `${fmtHours(f.hours)} ${t('unit.h')}`, onClick: () => viewFriend(f.id) }))} />
              </div>
            )}
          </div>
        ) : null}

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
      <>
        <h2 style={{ marginTop: 22 }}>{t('artist.albums')}</h2>
        <div className="t4">
          {art.albums.map((g) => {
            const year = g['first-release-date'] ? g['first-release-date'].slice(0, 4) : '—';
            return (
              <button key={g.id} onClick={() => openMbGroup(g.title, art.name, g.id)} style={{ textAlign: 'left', color: 'inherit', opacity: resolvingGroup === g.id ? 0.6 : 1 }}>
                <CoverArt url={coverArtUrl(g.id)} fallbackLetter={g.title[0] || '?'} className="cov mb" px={170} style={{ width: '100%', aspectRatio: '1' }} />
                <b style={{ display: 'block', marginTop: 8, fontSize: 14 }}>{g.title}</b>
                <small className="muted" style={{ fontWeight: 600 }}>{year}</small>
                <span className="tag" style={{ marginTop: 6 }}>{t('artist.mbNoRatings')}</span>
              </button>
            );
          })}
        </div>
      </>
    );
  }

  return (
    <>
      <button className="crumb" onClick={() => goBack('discover')}>‹ {t('artist.backDiscover')}</button>
      <div className="tile t-ink glow" style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
        <span className="ph">{art.name[0]}</span>
        <div style={{ flex: 1, minWidth: 200 }}>
          <p className="eyebrow muted" style={{ margin: 0 }}>{t('artist.mbEyebrow')}</p>
          <h1 className="big" style={{ margin: 0, fontSize: 'clamp(34px,7vw,56px)' }}>{art.name}</h1>
          <p className="muted" style={{ fontWeight: 600, marginTop: 4 }}>{t('artist.mbSimpleView')}</p>
        </div>
        {/* Rev 9: how many albums and the years active. */}
        {art.albums && art.albums.length > 0 && (() => {
          const years = art.albums.map((g) => parseInt((g['first-release-date'] || '').slice(0, 4), 10)).filter((y) => y > 0).sort((x, y) => x - y);
          return (
            <div className="s3x" style={{ margin: 0, minWidth: 180 }}>
              <div><b className="num">{art.albums.length}</b><small>{t('artist.mbAlbums')}</small></div>
              {years.length > 0 && <div><b className="num">{years[0] === years[years.length - 1] ? years[0] : `${years[0]}–${years[years.length - 1]}`}</b><small>{t('artist.mbActive')}</small></div>}
            </div>
          );
        })()}
      </div>
      {body}
    </>
  );
}
