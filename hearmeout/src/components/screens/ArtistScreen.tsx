'use client';

import { useEffect, useMemo, useState } from 'react';
import { useApp } from '@/lib/AppContext';
import type { Device, SpotifyArtistAlbum } from '@/lib/types';
import { coverArtUrl } from '@/lib/musicbrainz';
import { CoverArt } from '../ui/CoverArt';
import { HeartIcon } from '../ui/Icons';
import { ArtistAvatar } from '../ui/ArtistAvatar';
import { userAvatarStyle } from '@/lib/format';

function SpotifyAlbumCard({ album, fallbackLetter, onOpen, unreleasedLabel, score }: {
  album: SpotifyArtistAlbum;
  fallbackLetter: string;
  onOpen: (id: string) => void;
  unreleasedLabel?: string;
  score?: number;
}) {
  return (
    <button className="cvw" onClick={() => onOpen(album.id)} style={{ textAlign: 'left', width: '100%' }}>
      <CoverArt url={album.cover ?? undefined} fallbackLetter={fallbackLetter} className={`cov${unreleasedLabel ? ' ann' : ''}`} style={{ width: '100%', aspectRatio: '1' }}>
        {score != null && <span className="bdg">{score.toFixed(1)}</span>}
      </CoverArt>
      <div style={{ marginTop: 8 }}>
        <b>{album.title}</b>
        <div className="muted">{unreleasedLabel ?? (album.year ?? '—')}</div>
      </div>
    </button>
  );
}

export function ArtistScreen({ device }: { device: Device }) {
  const { t, state, albumRatings, myRatings, goBack, openAlbum, showToast, lovedItems, toggleLoved, viewFriend } = useApp();
  const art = state.currentArtist;
  const gridClass = 'cgrid';
  const [resolvingGroup, setResolvingGroup] = useState<string | null>(null);

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

  const [topFan, setTopFan] = useState<{ id: string; name: string; handle: string; avatarUrl: string | null; hours: number } | null>(null);
  useEffect(() => {
    if (!art || art.source !== 'spotify') { setTopFan(null); return; }
    let cancelled = false;
    setTopFan(null);
    fetch(`/api/artist/${art.id}/top-fan?name=${encodeURIComponent(art.name)}`)
      .then((r) => (r.ok ? r.json() : { topFan: null }))
      .then((d) => { if (!cancelled) setTopFan(d.topFan); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [art?.id, art?.source]);

  const yourStats = useMemo(() => {
    if (!art?.releasedAlbums) return null;
    const ids = new Set(art.releasedAlbums.map((al) => al.id));
    const mine = myRatings.filter((r) => ids.has(r.albumId));
    if (!mine.length) return null;
    const top = [...mine].sort((a, b) => b.stars - a.stars)[0];
    const topAlbum = art.releasedAlbums.find((al) => al.id === top.albumId);
    return {
      count: mine.length,
      avg: mine.reduce((s, r) => s + r.stars, 0) / mine.length,
      topTitle: topAlbum?.title ?? null,
    };
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

  if (art.source === 'spotify') {
    let body;
    if (art.loading) {
      body = <p className="muted">{t('artist.loadingAlbums')}</p>;
    } else if (art.error) {
      body = <div className="tile empty"><p>{art.error}</p></div>;
    } else {
      body = (
        <>
          <div className="sec">
            <h2>{t('artist.releasedAlbums')}</h2>
            {art.releasedAlbums?.length ? (
              <div className={gridClass}>
                {art.releasedAlbums.map((al) => (
                  <SpotifyAlbumCard key={al.id} album={al} fallbackLetter={art.name[0] || '?'} onOpen={openAlbum} score={albumRatings[al.id]?.avg} />
                ))}
              </div>
            ) : <p className="muted">{t('artist.notFound')}</p>}
          </div>
          <div className="sec">
            <h2>{t('artist.upcomingAlbums')}</h2>
            {art.upcomingAlbums?.length ? (
              <div className={gridClass}>
                {art.upcomingAlbums.map((al) => (
                  <SpotifyAlbumCard key={al.id} album={al} fallbackLetter={art.name[0] || '?'} onOpen={openAlbum} unreleasedLabel={t('artist.unreleased')} />
                ))}
              </div>
            ) : <p className="muted">{t('artist.noUpcoming')}</p>}
          </div>
        </>
      );
    }

    return (
      <>
        <button className="crumb" onClick={() => goBack('catalog')}>‹ {t('artist.back')}</button>
        <div className="tile t-ink hero">
          <div className="duel" style={{ alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
              <CoverArt url={art.photo ?? undefined} fallbackLetter={art.name[0] || '?'} className="ph" />
              <div>
                <div className="eyebrow">{t('artist.subtitleSpotify')}</div>
                <h1 style={{ marginBottom: 6 }}>{art.name}</h1>
                {!!art.genres?.length && (
                  <div className="chips" style={{ marginBottom: 0 }}>
                    {art.genres.map((g) => <span className="chip" key={g}>{g}</span>)}
                  </div>
                )}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              {communityScore ? (
                <><span className="num" style={{ fontSize: 38 }}>{communityScore.avg.toFixed(1)}</span><div className="muted">{t('artist.communityRatings', { count: communityScore.count })}</div></>
              ) : <div className="muted">{t('album.noRatings')}</div>}
            </div>
          </div>
          <div className="acts">
            <button className={`btn ghost love${isLoved ? ' on' : ''}`} onClick={() => toggleLoved('artist', art.name, null, art.id, art.photo ?? null)}>
              <HeartIcon /> {isLoved ? t('artist.loved') : t('artist.love')}
            </button>
          </div>
        </div>

        {topFan && (
          <button className="tile" onClick={() => viewFriend(topFan.id)} style={{ cursor: 'pointer', marginTop: 14, textAlign: 'left', width: '100%' }}>
            <div className="row" style={{ border: 0, padding: 0 }}>
              <div className="dot" style={userAvatarStyle(topFan)}>🏆</div>
              <div className="g"><b>{t('artist.topFan', { name: topFan.name })}</b><div className="muted">{t('artist.topFanHours', { hours: topFan.hours })}</div></div>
            </div>
          </button>
        )}

        {yourStats && (
          <div className="tile" style={{ marginTop: 14 }}>
            <h3>{t('artist.yourAndArtist')}</h3>
            <div className="stats3">
              <div><span className="num">{yourStats.count}</span><small className="muted">{t('artist.yourRatedCount')}</small></div>
              <div><span className="num">{yourStats.avg.toFixed(1)}</span><small className="muted">{t('history.avg')}</small></div>
            </div>
            {yourStats.topTitle && <p className="muted">{t('artist.yourTop', { title: yourStats.topTitle })}</p>}
          </div>
        )}

        {body}
      </>
    );
  }

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
        <div className={gridClass}>
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
