'use client';

import { useEffect, useState } from 'react';
import { fmt1 } from '@/lib/numberFormat';
import { useApp } from '@/lib/AppContext';
import type { Device } from '@/lib/types';
import { CoverArt } from '../ui/CoverArt';
import { HeartIcon, PlayIcon, BookmarkIcon } from '../ui/Icons';
import { Stars, StarSlider } from '../redesign/Stars';
import { PreviewButton } from '../redesign/PreviewButton';
import { pluralForKey } from '@/lib/i18n';
import type { QueueTrack } from '@/lib/PlayerContext';
import { usePlayer } from '@/lib/PlayerContext';
import { userAvatarStyle } from '@/lib/format';
import { AlbumReviews } from '../AlbumReviews';
import { AlbumRatingDistribution } from '../AlbumRatingDistribution';
import { AlbumTagsSummary } from '../AlbumTagsSummary';
import { REVIEW_TAG_ORDER, REVIEW_TAG_LABEL_KEY, MAX_REVIEW_TAGS } from '@/lib/reviewTags';

type FriendRating = { id: string; name: string; avatarUrl: string | null; stars: number };

// "Friends who rated" (spec 6.2): which of the viewer's friends rated this
// exact album.
function FriendsWhoRated({ albumId }: { albumId: string }) {
  const { t, me } = useApp();
  const [rows, setRows] = useState<FriendRating[] | null>(null);

  useEffect(() => {
    if (!me || !me.friends.length) { setRows([]); return; }
    let cancelled = false;
    const byId = new Map(me.friends.map((f) => [f.id, f]));
    fetch(`/api/albums/${encodeURIComponent(albumId)}/friends`)
      .then((r) => (r.ok ? r.json() : { ratings: [] }))
      .then((d: { ratings: { userId: string; stars: number }[] }) => {
        if (cancelled) return;
        setRows(d.ratings.map((r) => {
          const f = byId.get(r.userId);
          return { id: r.userId, name: f?.name || '?', avatarUrl: f?.avatarUrl ?? null, stars: r.stars };
        }));
      });
    return () => { cancelled = true; };
  }, [albumId, me]);

  return (
    <div className="tile t-soft2">
      <h3 style={{ marginBottom: 6 }}>{t('album.friendsWhoRated')}</h3>
      {rows === null ? null : rows.length ? (
        rows.map((r) => (
          <div className="row" key={r.id}>
            <div className="dot" style={userAvatarStyle({ avatarUrl: r.avatarUrl })}>{!r.avatarUrl && r.name[0]}</div>
            <b className="g">{r.name}</b>
            <span className="stars"><Stars value={r.stars} size={15} /></span>
            <span className="num" style={{ fontSize: 30 }}>{fmt1(r.stars)}</span>
          </div>
        ))
      ) : (
        <p className="muted">{t('album.friendsWhoRatedEmpty')}</p>
      )}
    </div>
  );
}

// The prototype has no separate album-browsing screen: vRate() in
// reference/app.js is one continuous page that shows the cover, friends'
// ratings, tracklist, community stats and reviews alongside the rating
// widget itself — there's no click-through from "browse" to "rate". This
// screen matches that: it's always live, not a form you submit and leave.
export function RateScreen({ device: _device }: { device: Device }) {
  const {
    state, t, language, albums, liveAlbums, failedAlbumIds, albumRatings, myRatings, spotifyCovers,
    reviewsVersion, openSpotifyArtist, ensureLiveAlbum, lovedItems, toggleLoved, laterItems, toggleLaterAlbum, toggleLaterTrack, me,
    setRatingValue, publishRating, showToast, viewHistory,
  } = useApp();
  const { playQueue, currentTrack, playing, progress } = usePlayer();

  const staticMatch = albums.find((x) => x.id === state.currentAlbumId);
  const enriched = liveAlbums[state.currentAlbumId];
  const a = enriched || staticMatch;

  useEffect(() => {
    if (state.activeScreen === 'rate' && !enriched) ensureLiveAlbum(state.currentAlbumId, staticMatch?.spotifyId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.activeScreen, state.currentAlbumId, enriched]);

  const [circleAvg, setCircleAvg] = useState<{ avg: number; n: number } | null>(null);
  useEffect(() => {
    if (!a || !me) return;
    let cancelled = false;
    // "your circle": your score plus friends' visible ones (server-side).
    const mine = myRatings.find((r) => r.albumId === a.id)?.stars;
    fetch(`/api/albums/${encodeURIComponent(a.id)}/friends`)
      .then((r) => (r.ok ? r.json() : { ratings: [] }))
      .then((d: { ratings: { stars: number }[] }) => {
        if (cancelled) return;
        const scores = [...d.ratings.map((r) => r.stars), ...(mine != null ? [mine] : [])];
        setCircleAvg(scores.length ? { avg: scores.reduce((s, x) => s + x, 0) / scores.length, n: scores.length } : null);
      });
    return () => { cancelled = true; };
  }, [a, me, myRatings]);

  // Third stat tile (spec 6.2): your plays of this album.
  const [myPlays, setMyPlays] = useState<number | null>(null);
  const playIds = a ? [a.id, a.spotifyId].filter(Boolean).join(',') : '';
  useEffect(() => {
    if (!playIds || !me) { setMyPlays(null); return; }
    let cancelled = false;
    fetch(`/api/me/album-plays?ids=${encodeURIComponent(playIds)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled) setMyPlays(d ? d.plays : null); });
    return () => { cancelled = true; };
  }, [playIds, me]);

  const [text, setText] = useState(state.ratingDraftText);
  useEffect(() => setText(state.ratingDraftText), [state.currentAlbumId, state.ratingDraftText]);

  const existing = myRatings.find((r) => r.albumId === state.currentAlbumId);
  const existingTagsKey = (existing?.tags ?? []).join(',');
  const [tags, setTags] = useState<string[]>(existing?.tags ?? []);
  useEffect(() => setTags(existing?.tags ?? []), [state.currentAlbumId, existingTagsKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggleTag = (id: string) => {
    setTags((cur) => {
      if (cur.includes(id)) return cur.filter((x) => x !== id);
      if (cur.length >= MAX_REVIEW_TAGS) { showToast(t('rate.tooManyTags')); return cur; }
      return [...cur, id];
    });
  };

  const chips = (
    <div className="chips">
      <button className="chip on">{t('rate.rateAnAlbum')}</button>
      <button className="chip" onClick={() => viewHistory('rate')}>{t('rate.historyChip')}</button>
    </div>
  );

  if (!a) {
    const failed = !!failedAlbumIds[state.currentAlbumId];
    return <>{chips}<div className="tile empty"><p>{failed ? t('album.loadError') : t('album.loading')}</p></div></>;
  }

  const ratingInfo = albumRatings[a.id];
  const val = state.ratingValue || 0;
  const label = t('rate.hintEmpty');
  const isEditing = myRatings.some((r) => r.albumId === a.id);
  const cover = spotifyCovers[a.id] || a.cover;
  const trackQueue: QueueTrack[] = a.tracklist.map((tr) => ({ title: tr, artist: a.artist, cover, albumId: a.id, spotifyId: a.spotifyId }));
  const openSpotifyUrl = a.spotifyId ? `https://open.spotify.com/album/${a.spotifyId}` : null;
  const albumLoved = lovedItems.some((li) => li.type === 'album' && li.title === a.title && li.artist === a.artist);
  const savedForLater = laterItems.some((li) => li.type === 'album' && li.albumId === a.id);
  const vsAverage = val > 0 && ratingInfo ? val - ratingInfo.avg : null;
  // prevHtml(): the preview line follows whichever track of this album is
  // loaded in the player; otherwise it invites a listen before scoring.
  const curIdx = currentTrack?.albumId === a.id ? a.tracklist.indexOf(currentTrack.title) : -1;
  const fmtT = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
  const fmtDur = (ms: number | null | undefined) => (ms ? fmtT(Math.round(ms / 1000)) : '');

  const tracklist = a.tracklist.length ? (
    <div className="stack">
      {a.tracklist.map((tr, i) => {
        const isRowCurrent = currentTrack?.albumId === a.id && currentTrack?.title === tr;
        const isRowPlaying = isRowCurrent && playing;
        const trackSaved = laterItems.some((li) => li.type === 'track' && li.albumId === a.id && li.trackIndex === i);
        return (
          <div className={`row trk${isRowCurrent ? ' cur' : ''}`} key={`${i}-${tr}`}>
            <button className="rowlink" onClick={() => playQueue(trackQueue, i)} aria-label={t('album.playPreviewOf', { title: tr })}>
              <span className="num" style={{ fontSize: 20, width: 24, opacity: 0.8 }}>{i + 1}</span>
              <span className="g"><b>{tr}</b></span>
              {fmtDur(a.trackDurations?.[i]) && <small className="muted" style={{ fontWeight: 700 }}>{fmtDur(a.trackDurations?.[i])}</small>}
              <span className="ticn">{isRowPlaying ? <span className="eq"><b /><b /><b /></span> : <PlayIcon size={14} />}</span>
            </button>
            <button
              className={`ib love later${trackSaved ? ' on' : ''}`}
              aria-pressed={trackSaved}
              aria-label={trackSaved ? t('track.removeLater') : t('track.saveLater')}
              onClick={() => toggleLaterTrack(a.id, i, tr, a.artist, cover || null)}
            >
              <BookmarkIcon />
            </button>
          </div>
        );
      })}
    </div>
  ) : (
    <p className="muted">{t('album.tracklistEmpty')}</p>
  );

  return (
    <>
      {chips}
      <div className="two">
        <div className="stack">
          <CoverArt url={cover} fallbackLetter={a.artist[0] || '?'} className="cov" style={{ width: '100%', aspectRatio: '1' }} />
          <FriendsWhoRated albumId={a.id} />
        </div>
        <div className="stack">
          <p className="eyebrow muted">
            {a.artistId ? <span className="link" style={{ cursor: 'pointer' }} onClick={() => openSpotifyArtist(a.artistId!, a.artist)}>{a.artist}</span> : a.artist}
            {a.genre && <> · <span className="tag">{a.genre}</span></>}
            {a.year ? ` · ${a.year}` : ''}
            {a.tracklist.length ? ` · ${a.tracklist.length} ${t('album.tracksCount')}` : ''}
          </p>
          <h1 className="big">{a.title}</h1>
          <div className="acts" style={{ margin: '0 0 14px' }}>
            <button className={`btn ghost love later${savedForLater ? ' on' : ''}`} aria-pressed={savedForLater} onClick={() => toggleLaterAlbum(a.id, a.title, a.artist, cover || null)}>
              <BookmarkIcon /> {savedForLater ? t('album.savedForLater') : t('album.listenLater')}
            </button>
            <button className={`btn ghost love${albumLoved ? ' on' : ''}`} aria-pressed={albumLoved} aria-label={albumLoved ? t('album.removeFromLoved') : t('album.addToLoved')} onClick={() => toggleLoved('album', a.title, a.artist, a.spotifyId ?? null, spotifyCovers[a.id] || a.cover || null)}>
              <HeartIcon /> {albumLoved ? t('album.loved') : t('album.love')}
            </button>
            {openSpotifyUrl && <a className="btn ghost" href={openSpotifyUrl} target="_blank" rel="noreferrer">{t('album.openInSpotify')}</a>}
          </div>
          {a.tracklist.length > 0 && (
            <div className="pvw">
              <PreviewButton tracks={trackQueue} index={curIdx >= 0 ? curIdx : 0} />
              <div>
                <b style={{ display: 'block' }}>{curIdx >= 0 ? a.tracklist[curIdx] : t('album.preview30s')}</b>
                <small className="muted" style={{ fontWeight: 700 }}>
                  {fmtT(curIdx >= 0 ? progress * 30 : 0)} / 0:30 · {curIdx >= 0 ? a.artist : t('album.listenBeforeScore')}
                </small>
              </div>
            </div>
          )}
          <div className="stats3">
            <div className="tile t-pop">
              {circleAvg ? <span className="num">{fmt1(circleAvg.avg)}</span> : <span className="num">—</span>}
              <small>{t('album.yourCircle')}</small>
            </div>
            <div className="tile t-ac">
              {ratingInfo ? <span className="num">{fmt1(ratingInfo.avg)}</span> : <span className="num">—</span>}
              <small>{t('album.everyoneCount', { n: ratingInfo?.count ?? 0 })}</small>
            </div>
            <div className="tile t-ink">
              <span className="num">{myPlays ?? '–'}</span>
              <small>{t('album.yourPlays')}</small>
            </div>
          </div>

          <div className="tile ratebox">
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
              <div className="duel">
                <div className="bub b-ac"><span className="num">{val > 0 ? fmt1(val) : '–'}</span><span className="w">{t('rate.yourTake')}</span></div>
              </div>
              <div>
                <StarSlider value={val} onChange={setRatingValue} size={34} />
                <p className="muted" style={{ fontSize: 14, fontWeight: 600, marginTop: 8 }}>{label}</p>
              </div>
            </div>
          </div>

          <div>
            <label>{t('rate.tagsLabel')} <span className="muted" style={{ fontWeight: 700 }}>{t('rate.tagsCount', { n: tags.length, max: MAX_REVIEW_TAGS })}</span></label>
            <div className="tagrow">
              {REVIEW_TAG_ORDER.map((id) => (
                <button key={id} className={`chip${tags.includes(id) ? ' on' : ''}`} aria-pressed={tags.includes(id)} style={{ margin: 0 }} onClick={() => toggleTag(id)}>
                  {t(REVIEW_TAG_LABEL_KEY[id])}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="rv">{t('rate.reviewLabel')}</label>
            <textarea id="rv" maxLength={2000} placeholder={t('rate.reviewPlaceholder')} value={text} onChange={(e) => setText(e.target.value)} />
            <small className="muted" style={{ fontWeight: 700, display: 'block', textAlign: 'right', marginTop: 4 }}>{text.length} / 2000</small>
          </div>

          <div className="acts" style={{ marginTop: 0 }}>
            <button
              className="btn lg"
              disabled={val <= 0}
              onClick={() => {
                if (val <= 0) { showToast(t('rate.needStars')); return; }
                publishRating(a.id, val, text.trim(), tags, false);
              }}
            >
              {isEditing ? t('rate.save') : t('rate.publish')}
            </button>
            <button
              className="btn ghost lg"
              disabled={val <= 0}
              onClick={() => {
                if (val <= 0) { showToast(t('rate.needStars')); return; }
                publishRating(a.id, val, text.trim(), tags, true);
              }}
            >
              {t('rate.keepPrivate')}
            </button>
          </div>
          {val <= 0 && <small className="muted" style={{ fontWeight: 700 }}>{t('rate.pickToPost')}</small>}
        </div>
      </div>

      <div className="sec bento b3">
        <div className="tile s2">
          <h2>{t('album.tracklist')}</h2>
          <p className="muted" style={{ fontWeight: 600, margin: '-6px 0 8px' }}>{t('album.tracklistHint')}</p>
          <div>{tracklist}</div>
        </div>
        <div className="tile">
          <h2>{t('album.community')}</h2>
          <div style={{ display: 'flex', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
            <span className="num" style={{ fontSize: 64, color: 'var(--acct)' }}>{ratingInfo ? fmt1(ratingInfo.avg) : '–'}</span>
            <span className="stars"><Stars value={ratingInfo?.avg ?? 0} size={18} /></span>
          </div>
          <p className="muted" style={{ fontWeight: 700 }}>{ratingInfo ? `${ratingInfo.count} ${pluralForKey(language, ratingInfo.count, 'album.ratingOne', 'album.ratingFew', 'album.ratingMany')}` : t('album.noRatings')}</p>
          {vsAverage != null ? (
            <p style={{ fontWeight: 800, marginTop: 8 }}>
              {t(vsAverage >= 0 ? 'rate.aboveAverage' : 'rate.belowAverage', { score: fmt1(val), diff: fmt1(Math.abs(vsAverage)) })}
            </p>
          ) : (
            <p className="muted" style={{ fontWeight: 600, marginTop: 8 }}>{t('rate.rateToCompare')}</p>
          )}
          <div style={{ marginTop: 14 }}><AlbumRatingDistribution albumId={a.id} refreshToken={reviewsVersion} you={val > 0 ? val : null} /></div>
          <AlbumTagsSummary albumId={a.id} refreshToken={reviewsVersion} />
        </div>
        <div className="tile s3">
          <h2>{t('album.reviews')}</h2>
          <AlbumReviews albumId={a.id} refreshToken={reviewsVersion} />
        </div>
      </div>
    </>
  );
}
