'use client';

import { useEffect, useState } from 'react';
import { useApp } from '@/lib/AppContext';
import type { Device } from '@/lib/types';
import { CoverArt } from '../ui/CoverArt';
import { HeartIcon } from '../ui/Icons';
import { Stars } from '../redesign/Stars';
import { PreviewButton } from '../redesign/PreviewButton';
import { pluralForKey } from '@/lib/i18n';
import type { QueueTrack } from '@/lib/PlayerContext';
import { usePlayer } from '@/lib/PlayerContext';
import { supabase } from '@/lib/supabaseClient';
import { userAvatarStyle } from '@/lib/format';
import { AlbumReviews } from '../AlbumReviews';
import { AlbumRatingDistribution } from '../AlbumRatingDistribution';
import { AlbumTagsSummary } from '../AlbumTagsSummary';

type FriendRating = { id: string; name: string; avatarUrl: string | null; stars: number };

// "Friends who rated" (spec 6.2) — not previously in this app: which of the
// viewer's friends rated this exact album, most recent first.
function FriendsWhoRated({ albumId }: { albumId: string }) {
  const { t, me } = useApp();
  const [rows, setRows] = useState<FriendRating[] | null>(null);

  useEffect(() => {
    if (!me || !me.friends.length) { setRows([]); return; }
    let cancelled = false;
    const friendIds = me.friends.map((f) => f.id);
    const byId = new Map(me.friends.map((f) => [f.id, f]));
    supabase.from('ratings').select('user_id, stars').eq('album_id', albumId).in('user_id', friendIds)
      .then(({ data }) => {
        if (cancelled) return;
        setRows((data || []).map((r) => {
          const f = byId.get(r.user_id as string);
          return { id: r.user_id as string, name: f?.name || '?', avatarUrl: f?.avatarUrl ?? null, stars: Number(r.stars) };
        }));
      });
    return () => { cancelled = true; };
  }, [albumId, me]);

  return (
    <div className="tile">
      <h3>{t('album.friendsWhoRated')}</h3>
      {rows === null ? null : rows.length ? (
        <div className="stack" style={{ marginTop: 10 }}>
          {rows.map((r) => (
            <div className="row" key={r.id}>
              <div className="dot" style={userAvatarStyle({ avatarUrl: r.avatarUrl })}>{r.name[0]}</div>
              <div className="g"><b>{r.name}</b></div>
              <Stars value={r.stars} size={14} />
            </div>
          ))}
        </div>
      ) : (
        <p className="muted">{t('album.friendsWhoRatedEmpty')}</p>
      )}
    </div>
  );
}

export function AlbumScreen({ device }: { device: Device }) {
  const { state, t, language, albums, liveAlbums, failedAlbumIds, albumRatings, myRatings, spotifyCovers, reviewsVersion, goBack, openRateFor, openSpotifyArtist, ensureLiveAlbum, lovedItems, toggleLoved, me } = useApp();
  const { playQueue, currentTrack, playing } = usePlayer();
  const staticMatch = albums.find((x) => x.id === state.currentAlbumId);
  const enriched = liveAlbums[state.currentAlbumId];
  const a = enriched || staticMatch;

  useEffect(() => {
    if (state.activeScreen === 'album' && !enriched) ensureLiveAlbum(state.currentAlbumId, staticMatch?.spotifyId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.activeScreen, state.currentAlbumId, enriched]);

  const [wishlisted, setWishlisted] = useState(false);
  useEffect(() => { setWishlisted(false); }, [a?.id]);

  const [circleAvg, setCircleAvg] = useState<{ avg: number; n: number } | null>(null);
  useEffect(() => {
    if (!a || !me) return;
    let cancelled = false;
    const ids = [me.id, ...me.friends.map((f) => f.id)];
    supabase.from('ratings').select('stars').eq('album_id', a.id).in('user_id', ids).then(({ data }) => {
      if (cancelled || !data?.length) { if (!cancelled) setCircleAvg(null); return; }
      const avg = data.reduce((s, r) => s + Number(r.stars), 0) / data.length;
      setCircleAvg({ avg, n: data.length });
    });
    return () => { cancelled = true; };
  }, [a, me]);

  if (!a) {
    const failed = !!failedAlbumIds[state.currentAlbumId];
    return (
      <>
        <button className="crumb" onClick={() => goBack('catalog')}>‹ {t('nav.home')}</button>
        <div className="tile empty"><p>{failed ? t('album.loadError') : t('album.loading')}</p></div>
      </>
    );
  }

  const ratingInfo = albumRatings[a.id];
  const myStars = myRatings.find((r) => r.albumId === a.id)?.stars ?? null;
  const cover = spotifyCovers[a.id] || a.cover;
  const trackQueue: QueueTrack[] = a.tracklist.map((tr) => ({ title: tr, artist: a.artist, cover, albumId: a.id, spotifyId: a.spotifyId }));

  const openSpotifyUrl = a.spotifyId ? `https://open.spotify.com/album/${a.spotifyId}` : null;
  const albumLoved = lovedItems.some((li) => li.type === 'album' && li.title === a.title && li.artist === a.artist);

  const tracklist = a.tracklist.length ? (
    <div className="stack">
      {a.tracklist.map((tr, i) => {
        const isRowCurrent = currentTrack?.albumId === a.id && currentTrack?.title === tr;
        return (
          <button className={`trk row${isRowCurrent ? ' cur' : ''}`} key={tr} onClick={() => playQueue(trackQueue, i)}>
            <span className="muted" style={{ width: 24 }}>{String(i + 1).padStart(2, '0')}</span>
            <b>{tr}</b>
            {isRowCurrent && playing && <span className="eq"><b /><b /><b /></span>}
          </button>
        );
      })}
    </div>
  ) : (
    <p className="muted">{t('album.tracklistEmpty')}</p>
  );

  return (
    <>
      <button className="crumb" onClick={() => goBack('catalog')}>‹ {t('nav.home')}</button>
      <div className="two">
        <div className="stack">
          <CoverArt url={cover} fallbackLetter={a.artist[0] || '?'} className="cov" style={{ width: '100%', aspectRatio: '1' }} />
          <FriendsWhoRated albumId={a.id} />
        </div>
        <div className="stack">
          <div className="eyebrow">
            {a.artistId ? <span className="link" style={{ cursor: 'pointer' }} onClick={() => openSpotifyArtist(a.artistId!)}>{a.artist}</span> : a.artist}
            {a.genre ? ` · ${a.genre}` : ''}{a.year ? ` · ${a.year}` : ''}
          </div>
          <h1 className="big">{a.title}</h1>
          <div className="acts">
            <button className="btn ghost" onClick={() => setWishlisted((v) => !v)}>
              {wishlisted ? t('album.inWishlist') : t('album.addWishlist')}
            </button>
            <button className={`btn ghost love${albumLoved ? ' on' : ''}`} onClick={() => toggleLoved('album', a.title, a.artist, a.spotifyId ?? null, spotifyCovers[a.id] || a.cover || null)}>
              <HeartIcon /> {albumLoved ? t('album.loved') : t('album.love')}
            </button>
            {openSpotifyUrl && <a className="btn ghost" href={openSpotifyUrl} target="_blank" rel="noreferrer">{t('album.openInSpotify')}</a>}
          </div>
          {a.tracklist.length > 0 && (
            <div className="pvw">
              <PreviewButton tracks={trackQueue} />
              <div>
                <b>{t('album.preview30s')}</b>
              </div>
            </div>
          )}
          <div className="stats3">
            <div className="tile">
              {circleAvg ? <span className="num">{circleAvg.avg.toFixed(1)}</span> : <span className="num">—</span>}
              <small className="muted">{t('album.yourCircle')}</small>
            </div>
            <div className="tile">
              {ratingInfo ? <span className="num">{ratingInfo.avg.toFixed(1)}</span> : <span className="num">—</span>}
              <small className="muted">{ratingInfo ? `${ratingInfo.count} ${pluralForKey(language, ratingInfo.count, 'album.ratingOne', 'album.ratingFew', 'album.ratingMany')}` : t('album.noRatings')}</small>
            </div>
            <div className="tile">
              <span className="num">{myStars != null ? myStars.toFixed(1) : '–'}</span>
              <small className="muted">{t('rate.yourRating')}</small>
            </div>
          </div>
          <button className="btn lg" onClick={() => openRateFor(a.id, 'album')}>{t('album.rateAlbum')}</button>
        </div>
      </div>

      <div className="bento b3">
        <div className="tile s2">
          <h3>{t('album.tracklist')}</h3>
          <div style={{ marginTop: 10 }}>{tracklist}</div>
        </div>
        <div className="tile">
          <h3>{t('album.ratingDistribution')}</h3>
          <div style={{ marginTop: 10 }}><AlbumRatingDistribution albumId={a.id} refreshToken={reviewsVersion} /></div>
          <AlbumTagsSummary albumId={a.id} refreshToken={reviewsVersion} />
        </div>
        <div className="tile s3">
          <h3>{t('album.reviews')}</h3>
          <div style={{ marginTop: 10 }}><AlbumReviews albumId={a.id} refreshToken={reviewsVersion} /></div>
        </div>
      </div>
    </>
  );
}
