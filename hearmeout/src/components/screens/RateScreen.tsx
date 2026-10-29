'use client';

import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { blurStyle } from '@/lib/imageColor';
import { ArtistName } from '../ui/ArtistName';
import { fmt1 } from '@/lib/numberFormat';
import { useApp } from '@/lib/AppContext';
import type { Device } from '@/lib/types';
import { CoverArt } from '../ui/CoverArt';
import { HeartIcon, PlayIcon, BookmarkIcon, ShareIcon, SpotifyLogo } from '../ui/Icons';
import { ShareAlbumModal } from '../ShareAlbumModal';
import { StarSlider } from '../redesign/Stars';
import { PreviewButton } from '../redesign/PreviewButton';
import type { QueueTrack } from '@/lib/PlayerContext';
import { usePlayer, prefetchQueueTrack, trackKey } from '@/lib/PlayerContext';
import { albumFriendsUrl, useAlbumJson } from '@/lib/useAlbumJson';
import { AlbumReviews } from '../AlbumReviews';
import { TrackScoreButton, TrackScoreEditor } from '../TrackScore';
import { useCachedJson } from '@/lib/cachedJson';
import type { TrackRatingsResponse } from '@/app/api/track-ratings/route';
import { PersonCards, Phrase, TintBox } from '../ui/Visual';
import { REVIEW_TAG_ORDER, REVIEW_TAG_LABEL_KEY, MAX_REVIEW_TAGS } from '@/lib/reviewTags';

type FriendRating = { id: string; name: string; avatarUrl: string | null; stars: number };

// "Friends who rated" (spec 6.2): which of the viewer's friends rated this
// exact album.
function FriendsWhoRated({ albumId }: { albumId: string }) {
  const { t, me, viewFriend } = useApp();
  const hasFriends = !!me?.friends.length;
  const data = useAlbumJson<{ ratings: { userId: string; stars: number }[] }>(hasFriends ? albumFriendsUrl(albumId) : null);
  const rows: FriendRating[] | null = !hasFriends ? [] : !data ? null : data.ratings.map((r) => {
    const f = me!.friends.find((x) => x.id === r.userId);
    return { id: r.userId, name: f?.name || '?', avatarUrl: f?.avatarUrl ?? null, stars: r.stars };
  });

  return (
    <div className="tile t-soft2">
      <h2>{t('album.friendsWhoRated')}</h2>
      {rows === null ? null : rows.length ? (
        <PersonCards people={rows.map((r) => ({ id: r.id, name: r.name, avatarUrl: r.avatarUrl, value: `★ ${fmt1(r.stars)}`, onClick: () => viewFriend(r.id) }))} />
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
// The switch's sticky bottom: just above the bottom menu (with the player
// bar in it) or the player bar on a computer — measured, since they come,
// go and change height — so before the page is scrolled the switch still
// shows above them.
function useStickBottom(ref: RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    const el = ref.current;
    if (!active || !el) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const dock = document.querySelector<HTMLElement>('.dock24');
      const bar = document.querySelector<HTMLElement>('#plhost.on');
      let bottom = window.innerHeight;
      const dockTop = dock && getComputedStyle(dock).display !== 'contents' ? dock.getBoundingClientRect().top : null;
      if (dockTop != null && dockTop > 0) bottom = dockTop;
      else if (bar) bottom = bar.getBoundingClientRect().top;
      el.style.bottom = `${Math.max(0, Math.round(window.innerHeight - bottom + 8))}px`;
    };
    const soon = () => { if (!frame) frame = requestAnimationFrame(measure); };
    soon();
    const ro = new ResizeObserver(soon);
    const dock = document.querySelector('.dock24');
    if (dock) ro.observe(dock);
    window.addEventListener('resize', soon);
    const timer = setInterval(soon, 1000);
    return () => {
      ro.disconnect();
      clearInterval(timer);
      window.removeEventListener('resize', soon);
      if (frame) cancelAnimationFrame(frame);
      el.style.bottom = '';
    };
  }, [ref, active]);
}

export function RateScreen({ device: _device }: { device: Device }) {
  const {
    state, t, albums, liveAlbums, failedAlbumIds, albumRatings, myRatings, spotifyCovers,
    reviewsVersion, ensureLiveAlbum, lovedItems, toggleLoved, laterItems, toggleLaterAlbum, toggleLaterTrack, me,
    setRatingValue, publishRating, showToast, viewHistory,
  } = useApp();
  const { playQueue, currentTrack, playing } = usePlayer();

  const staticMatch = albums.find((x) => x.id === state.currentAlbumId);
  const enriched = liveAlbums[state.currentAlbumId];
  const a = enriched || staticMatch;

  useEffect(() => {
    if (state.activeScreen === 'rate' && !enriched) ensureLiveAlbum(state.currentAlbumId, staticMatch?.spotifyId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.activeScreen, state.currentAlbumId, enriched]);

  // "your circle": your score plus friends' visible ones (server-side; the
  // same cached answer as "friends who rated").
  const friendScores = useAlbumJson<{ ratings: { stars: number }[] }>(a && me ? albumFriendsUrl(a.id) : null, reviewsVersion);
  const mineStars = a ? myRatings.find((r) => r.albumId === a.id)?.stars : undefined;
  const circleAvg = useMemo(() => {
    if (!friendScores) return null;
    const scores = [...friendScores.ratings.map((r) => r.stars), ...(mineStars != null ? [mineStars] : [])];
    return scores.length ? { avg: scores.reduce((s, x) => s + x, 0) / scores.length, n: scores.length } : null;
  }, [friendScores, mineStars]);

  // Track scores (yours, friends' averages, the best track) and which
  // track's slider is open.
  const trackScores = useCachedJson<TrackRatingsResponse>(state.currentAlbumId && me ? `/api/track-ratings?albumId=${encodeURIComponent(state.currentAlbumId)}` : null);
  const [openTrack, setOpenTrack] = useState<number | null>(null);
  const [sharing, setSharing] = useState(false);
  // Under the album: the rating form or the tracklist.
  const [tab, setTab] = useState<'rate' | 'tracks'>('rate');
  // The line with the rate | tracklist switch under it sticks to the top
  // of the screen once the album above has scrolled away (and to the bottom
  // menu while it's below the fold), so it never leaves the screen. When
  // it's stuck at the top, switching tabs starts the new tab from its top.
  const switchRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  useStickBottom(switchRef, state.activeScreen === 'rate' && !!a);
  const pickTab = (next: 'rate' | 'tracks') => {
    setTab(next);
    const el = switchRef.current, anchor = anchorRef.current;
    if (!el || !anchor) return;
    const stick = parseFloat(getComputedStyle(el).top) || 0;
    const natural = anchor.getBoundingClientRect().top + window.scrollY;
    if (window.scrollY > natural - stick) requestAnimationFrame(() => window.scrollTo({ top: natural - stick }));
  };
  useEffect(() => { setOpenTrack(null); setTab('rate'); }, [state.currentAlbumId]);

  const [text, setText] = useState(state.ratingDraftText);
  useEffect(() => setText(state.ratingDraftText), [state.currentAlbumId, state.ratingDraftText]);

  const existing = myRatings.find((r) => r.albumId === state.currentAlbumId);
  const existingTagsKey = (existing?.tags ?? []).join(',');
  const [tags, setTags] = useState<string[]>(existing?.tags ?? []);
  useEffect(() => setTags(existing?.tags ?? []), [state.currentAlbumId, existingTagsKey]); // eslint-disable-line react-hooks/exhaustive-deps
  // The first track's preview is looked up when the album opens, so the
  // big play button starts at once (other tracks: on hover / focus).
  const firstTrack = a?.tracklist[0];
  useEffect(() => {
    if (a && firstTrack) prefetchQueueTrack({ title: firstTrack, artist: a.artist, albumId: a.id, spotifyId: a.spotifyId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a?.id, firstTrack]);
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
  // prevHtml(): the preview line follows whichever track of this album is
  // loaded in the player; otherwise it invites a listen before scoring.
  const curIdx = currentTrack?.albumId === a.id ? a.tracklist.indexOf(currentTrack.title) : -1;
  // "your take" shows up once you're scoring or writing.
  const showTake = val > 0 || text.trim().length > 0;
  const fmtT = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
  const fmtDur = (ms: number | null | undefined) => (ms ? fmtT(Math.round(ms / 1000)) : '');

  const tracklist = a.tracklist.length ? (
    <div className="stack">
      {a.tracklist.map((tr, i) => {
        const isRowCurrent = currentTrack?.albumId === a.id && currentTrack?.title === tr;
        const isRowPlaying = isRowCurrent && playing;
        const trackSaved = laterItems.some((li) => li.type === 'track' && li.albumId === a.id && li.trackIndex === i);
        const ts = trackScores.data?.ready ? trackScores.data : null;
        const n = i + 1;
        return (
          <div key={`${i}-${tr}`} className="trw19">
          <div className={`row trk${isRowCurrent ? ' cur' : ''}`}>
            <button className="rowlink" data-pl={trackKey(trackQueue[i])} onClick={() => playQueue(trackQueue, i)} onPointerEnter={() => prefetchQueueTrack(trackQueue[i])} onFocus={() => prefetchQueueTrack(trackQueue[i])} aria-label={t('album.playPreviewOf', { title: tr })}>
              <span className="num" style={{ fontSize: 20, width: 24, opacity: 0.8 }}>{i + 1}</span>
              <span className="g"><b>{tr}</b>{ts?.best === n && <small className="bst19"><i className="ic ic-medal" aria-hidden="true" /> {t('track.best')}</small>}</span>
              {fmtDur(a.trackDurations?.[i]) && <small className="muted" style={{ fontWeight: 700 }}>{fmtDur(a.trackDurations?.[i])}</small>}
              <span className="ib ticn">{isRowPlaying ? <span className="eq"><b /><b /><b /></span> : <PlayIcon size={14} />}</span>
            </button>
            <button
              className={`ib love later${trackSaved ? ' on' : ''}`}
              aria-pressed={trackSaved}
              aria-label={trackSaved ? t('track.removeLater') : t('track.saveLater')}
              onClick={() => toggleLaterTrack(a.id, i, tr, a.artist, cover || null)}
            >
              <BookmarkIcon />
            </button>
            {ts && <TrackScoreButton mine={ts.mine[n] ?? null} friends={ts.friends[n] ?? null} open={openTrack === n} onToggle={() => setOpenTrack(openTrack === n ? null : n)} />}
          </div>
          {ts && openTrack === n && <TrackScoreEditor key={`${a.id}:${n}`} albumId={a.id} trackNumber={n} title={tr} mine={ts.mine[n] ?? null} onSaved={() => trackScores.reload()} />}
          </div>
        );
      })}
    </div>
  ) : (
    <p className="muted">{t('album.tracklistEmpty')}</p>
  );

  // The cover, blurred, behind the whole page (fixed to the screen, so it's
  // put on the shell, not inside the moving screen) while this page is open.
  const backdrop = state.activeScreen === 'rate' && cover && typeof document !== 'undefined' && document.querySelector('.rd')
    ? createPortal(<div className="abg17" style={blurStyle(cover, 320)} aria-hidden="true" />, document.querySelector('.rd')!)
    : null;
  // "open in" Spotify, at the very end of both tabs.
  const spotifyLink = openSpotifyUrl ? (
    <a className="osp24" href={openSpotifyUrl} target="_blank" rel="noreferrer" aria-label={t('album.openInSpotify')}><span>{t('album.openIn')}</span><SpotifyLogo /><b>Spotify</b></a>
  ) : null;
  const shareModal = sharing ? <ShareAlbumModal album={{ id: a.id, title: a.title, artist: a.artist, cover: cover || null }} onClose={() => setSharing(false)} /> : null;

  return (
    <div className="alp17">
      {backdrop}
      {shareModal}
      {chips}
      {/* The album in the middle: cover, artist and title centred, then the
          play button with the icon-only actions beside it. */}
      <div className="ah23">
        <CoverArt url={cover} fallbackLetter={a.artist[0] || '?'} className="cov" />
        <p className="ahr"><ArtistName name={a.artist} id={a.artistId} size={22} /></p>
        <h1 className="big">{a.title}</h1>
        <p className="muted ahm">
          {[a.genre, a.year || null, a.tracklist.length ? `${a.tracklist.length} ${t('album.tracksCount')}` : null].filter(Boolean).join(' · ')}
        </p>
        <div className="aha">
          <button className={`ib love later${savedForLater ? ' on' : ''}`} aria-pressed={savedForLater} aria-label={savedForLater ? t('album.savedForLater') : t('album.listenLater')} title={savedForLater ? t('album.savedForLater') : t('album.listenLater')} onClick={() => toggleLaterAlbum(a.id, a.title, a.artist, cover || null)}>
            <BookmarkIcon />
          </button>
          <button className={`ib love${albumLoved ? ' on' : ''}`} aria-pressed={albumLoved} aria-label={albumLoved ? t('album.removeFromLoved') : t('album.addToLoved')} title={albumLoved ? t('album.removeFromLoved') : t('album.addToLoved')} onClick={() => toggleLoved('album', a.title, a.artist, a.spotifyId ?? null, spotifyCovers[a.id] || a.cover || null)}>
            <HeartIcon />
          </button>
          {a.tracklist.length > 0 && <PreviewButton tracks={trackQueue} index={curIdx >= 0 ? curIdx : 0} size={72} />}
          <button className="ib love" aria-label={t('share.button')} title={t('share.button')} onClick={() => setSharing(true)}><ShareIcon /></button>
        </div>
        {/* Only the numbers there are (no row of dashes on an album nobody rated). */}
        {(circleAvg || ratingInfo?.count) ? (
          <Phrase parts={[
            ...(circleAvg ? [[`★ ${fmt1(circleAvg.avg)}`, t('album.yourCircle')]] as [string, string][] : []),
            ...(ratingInfo?.count ? [[`★ ${fmt1(ratingInfo.avg)}`, t('album.everyoneCount', { n: ratingInfo.count })]] as [string, string][] : []),
          ]} />
        ) : null}
      </div>

      <div ref={anchorRef} aria-hidden="true" />
      <div className="atp23" ref={switchRef}>
        <div className="btab14" role="tablist" aria-label={a.title}>
          <button role="tab" aria-selected={tab === 'rate'} className={tab === 'rate' ? 'on' : ''} onClick={() => pickTab('rate')}>{t('album.tabRate')}</button>
          <button role="tab" aria-selected={tab === 'tracks'} className={tab === 'tracks' ? 'on' : ''} onClick={() => pickTab('tracks')}>{t('album.tracklist')}</button>
        </div>
      </div>

      <div className="asc23">

        {tab === 'tracks' ? (
          <TintBox className="tile" picture={cover} fallbackKey={a.id}>
            <p className="muted" style={{ fontWeight: 600, margin: '0 0 8px' }}>{t('album.tracklistHint')}</p>
            <div>{tracklist}</div>
            {spotifyLink}
          </TintBox>
        ) : (
        <div className="stack">
          <div className="tile ratebox">
            <div>
              <div className="rst23">
                <StarSlider value={val} onChange={setRatingValue} size={34} />
                {showTake && <div className="bub b-ac sm"><span className="num">{val > 0 ? fmt1(val) : '–'}</span><span className="w">{t('rate.yourTake')}</span></div>}
              </div>
              <p className="muted" style={{ fontSize: 14, fontWeight: 600, marginTop: 8 }}>{label}</p>
            </div>
          </div>

          {(text.trim() || tags.length > 0) && <div>
            <label>{t('rate.tagsLabel')} <span className="muted" style={{ fontWeight: 700 }}>{t('rate.tagsCount', { n: tags.length, max: MAX_REVIEW_TAGS })}</span></label>
            <div className="tagrow">
              {REVIEW_TAG_ORDER.map((id) => (
                <button key={id} className={`chip${tags.includes(id) ? ' on' : ''}`} aria-pressed={tags.includes(id)} style={{ margin: 0 }} onClick={() => toggleTag(id)}>
                  {t(REVIEW_TAG_LABEL_KEY[id])}
                </button>
              ))}
            </div>
          </div>}

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
          {spotifyLink}
        </div>
        )}

      <div className="sec">
        {/* Friends who rated: after the album itself. */}
        <FriendsWhoRated albumId={a.id} />
      </div>

      <div className="sec">
        <h2>{t('album.reviews')}</h2>
        <AlbumReviews albumId={a.id} refreshToken={reviewsVersion} />
      </div>
      </div>
    </div>
  );
}
