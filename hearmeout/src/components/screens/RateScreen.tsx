'use client';

import { useEffect, useState } from 'react';
import { useApp } from '@/lib/AppContext';
import type { Device } from '@/lib/types';
import { CoverArt } from '../ui/CoverArt';
import { StarSlider } from '../redesign/Stars';
import { REVIEW_TAG_ORDER, REVIEW_TAG_LABEL_KEY, MAX_REVIEW_TAGS } from '@/lib/reviewTags';

export function RateScreen({ device }: { device: Device }) {
  const { state, t, albums, liveAlbums, failedAlbumIds, myRatings, spotifyCovers, goBack, showScreen, setRatingValue, publishRating, showToast, ensureLiveAlbum } = useApp();
  const staticMatch = albums.find((x) => x.id === state.currentAlbumId);
  const enriched = liveAlbums[state.currentAlbumId];
  const a = enriched || staticMatch;

  useEffect(() => {
    if (state.activeScreen === 'rate' && !enriched) ensureLiveAlbum(state.currentAlbumId, staticMatch?.spotifyId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.activeScreen, state.currentAlbumId, enriched]);

  const [text, setText] = useState(state.ratingDraftText);
  useEffect(() => setText(state.ratingDraftText), [state.currentAlbumId, state.ratingDraftText]);

  const existing = myRatings.find((r) => r.albumId === state.currentAlbumId);
  const existingTagsKey = (existing?.tags ?? []).join(',');
  const [tags, setTags] = useState<string[]>(existing?.tags ?? []);
  useEffect(() => setTags(existing?.tags ?? []), [state.currentAlbumId, existingTagsKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const [isPrivate, setIsPrivate] = useState(existing?.isPrivate ?? false);
  useEffect(() => setIsPrivate(existing?.isPrivate ?? false), [state.currentAlbumId, existing?.isPrivate]);
  const toggleTag = (id: string) => {
    setTags((cur) => {
      if (cur.includes(id)) return cur.filter((x) => x !== id);
      if (cur.length >= MAX_REVIEW_TAGS) { showToast(t('rate.tooManyTags')); return cur; }
      return [...cur, id];
    });
  };

  const chips = (
    <div className="chips">
      <button className="chip on">{t('album.rateAlbum')}</button>
      <button className="chip" onClick={() => showScreen('history')}>{t('nav.rate')}</button>
    </div>
  );

  if (!a) {
    const failed = !!failedAlbumIds[state.currentAlbumId];
    return <>{chips}<div className="tile empty"><p>{failed ? t('album.loadError') : t('album.loading')}</p></div></>;
  }

  const cover = spotifyCovers[a.id] || a.cover;
  const val = state.ratingValue || 0;
  const label = val > 0 ? t('rate.hintValue', { value: val.toFixed(1) }) : t('rate.hintEmpty');
  const isEditing = myRatings.some((r) => r.albumId === a.id);

  return (
    <>
      {chips}
      <div className="two">
        <div>
          <CoverArt url={cover} fallbackLetter={a.artist[0] || '?'} className="cov" style={{ width: '100%', maxWidth: 320, aspectRatio: '1', margin: '0 auto', display: 'block' }} />
        </div>
        <div className="stack">
          <div className="eyebrow">{isEditing ? t('rate.editTitle') : t('rate.newTitle')}</div>
          <h1 className="big" style={{ fontSize: 'clamp(28px,5vw,48px)' }}>{a.title}</h1>
          <p className="muted">{a.artist}</p>

          <div className="tile">
            <div className="duel">
              <div className="bub b-ac sm"><span className="num">{val > 0 ? val.toFixed(1) : '–'}</span><span className="w">{t('rate.yourRating')}</span></div>
            </div>
            <div style={{ marginTop: 14 }}>
              <StarSlider value={val} onChange={setRatingValue} size={34} />
            </div>
            <p className="muted" style={{ marginTop: 8 }}>{label}</p>
          </div>

          <div className="tile">
            <div className="setrow" style={{ border: 0, padding: 0, marginBottom: 10 }}>
              <b>{t('rate.tagsLabel')}</b>
              <small className="muted">{tags.length} / {MAX_REVIEW_TAGS}</small>
            </div>
            <div className="chips" style={{ marginBottom: 0 }}>
              {REVIEW_TAG_ORDER.map((id) => (
                <button key={id} className={`chip ${tags.includes(id) ? 'on' : ''}`} onClick={() => toggleTag(id)}>
                  {t(REVIEW_TAG_LABEL_KEY[id])}
                </button>
              ))}
            </div>
          </div>

          <div className="tile">
            <div className="setrow" style={{ border: 0, padding: 0, marginBottom: 10 }}>
              <b>{t('rate.reviewLabel')}</b>
              <small className="muted">{text.length} / 2000</small>
            </div>
            <textarea
              placeholder={t('rate.reviewPlaceholder')}
              value={text}
              maxLength={2000}
              onChange={(e) => setText(e.target.value)}
            />
          </div>

          <div className="tile">
            <div className="setrow" style={{ border: 0, padding: 0 }}>
              <div>
                <b>{t('rate.keepPrivate')}</b>
                <div><small className="muted">{t('rate.keepPrivateHint')}</small></div>
              </div>
              <button className="sw" role="switch" aria-checked={isPrivate} onClick={() => setIsPrivate((p) => !p)}><i /></button>
            </div>
          </div>

          <div className="acts">
            <button
              className="btn lg"
              disabled={val <= 0}
              onClick={() => {
                if (val <= 0) { showToast(t('rate.needStars')); return; }
                publishRating(a.id, val, text.trim(), tags, isPrivate);
              }}
            >
              {isEditing ? t('rate.save') : t('rate.publish')}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
