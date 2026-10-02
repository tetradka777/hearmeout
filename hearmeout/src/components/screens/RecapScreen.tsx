'use client';

import { useEffect, useRef, useState } from 'react';
import { useApp } from '@/lib/AppContext';
import type { Device, PublicProfile, RecapData, RecapPeriod } from '@/lib/types';
import { userAvatarStyle } from '@/lib/format';
import { pluralForKey, type TranslationKey } from '@/lib/i18n';
import { CoverArt } from '../ui/CoverArt';
import { PreviewButton } from '../redesign/PreviewButton';
import { drawRecapPoster } from '@/lib/posterCanvas';

const PERIOD_KEY: Record<RecapPeriod, TranslationKey> = { day: 'recap.day', month: 'recap.month', season: 'recap.season' };

function PosterDownloadButton({ data, name, periodLabel }: { data: RecapData; name: string; periodLabel: string }) {
  const { t } = useApp();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const download = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawRecapPoster(canvas, data, name, periodLabel);
    const url = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.href = url;
    link.download = 'hearmeout-recap.png';
    link.click();
  };

  return (
    <>
      <button className="btn ghost" onClick={download}>{t('recap.downloadPoster')}</button>
      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </>
  );
}

export function RecapScreen(_props: { device: Device }) {
  const { state, t, language, me, albums, liveAlbums, ensureRecap, recapCache, recapLocked, closeRecap, setRecapPeriod, setRecapSeasonKey, setRecapOffset, recapSeasons, openAlbum, openSpotifyArtist, viewFriend, openRecap } = useApp();
  const targetId = state.recapViewUserId === 'me' ? me?.id : state.recapViewUserId;
  const isMe = state.recapViewUserId === 'me';
  const [profile, setProfile] = useState<PublicProfile | null>(null);

  useEffect(() => {
    if (!targetId) return;
    ensureRecap(state.recapViewUserId, state.recapPeriod, state.recapSeasonKey, state.recapOffset);
  }, [state.recapViewUserId, state.recapPeriod, state.recapSeasonKey, state.recapOffset, targetId, ensureRecap]);

  useEffect(() => {
    if (state.recapPeriod === 'season' && !state.recapSeasonKey && recapSeasons?.length) {
      setRecapSeasonKey(recapSeasons[0].key);
    }
  }, [state.recapPeriod, state.recapSeasonKey, recapSeasons, setRecapSeasonKey]);

  useEffect(() => {
    if (isMe || !targetId) { setProfile(null); return; }
    let cancelled = false;
    fetch(`/api/users/${targetId}`).then((res) => (res.ok ? res.json() : null)).then((data) => {
      if (!cancelled) setProfile(data);
    });
    return () => { cancelled = true; };
  }, [isMe, targetId]);

  if (!targetId) return <div className="tile empty"><p>{t('app.loading')}</p></div>;
  const isSeason = state.recapPeriod === 'season';
  const cacheKey = `${targetId}:${state.recapPeriod}${isSeason && state.recapSeasonKey ? ':' + state.recapSeasonKey : state.recapOffset ? ':' + state.recapOffset : ''}`;
  const locked = !!recapLocked[cacheKey];
  const r = isSeason && !state.recapSeasonKey ? undefined : recapCache[cacheKey];
  const name = isMe ? me?.name : profile?.name;
  const avatarUrl = isMe ? me?.avatarUrl ?? null : profile?.avatarUrl ?? null;
  const vibe = r
    ? `${r.trackCount} ${pluralForKey(language, r.trackCount, 'recap.trackOne', 'recap.trackFew', 'recap.trackMany')}${r.topGenres[0] ? t('recap.vibeGenre', { genre: r.topGenres[0].genre }) : ''}`
    : '';

  const artistRowClick = (id: string | null) => { if (id) openSpotifyArtist(id); };
  const trackRowClick = (albumId: string | null) => { if (albumId) openAlbum(albumId); };

  return (
    <>
      <div className="setrow" style={{ border: 0, padding: 0 }}>
        <button className="crumb" onClick={closeRecap}>‹ {t('nav.home')}</button>
        <button className="ib" onClick={closeRecap} aria-label="Close">✕</button>
      </div>

      <div className="seg" role="radiogroup">
        {(['day', 'month', 'season'] as RecapPeriod[]).map((p) => (
          <button key={p} className={state.recapPeriod === p ? 'on' : ''} role="radio" aria-checked={state.recapPeriod === p} onClick={() => setRecapPeriod(p)}>
            {t(PERIOD_KEY[p])}
          </button>
        ))}
      </div>
      {isSeason && (
        recapSeasons === null ? (
          <p className="muted">{t('recap.loading')}</p>
        ) : recapSeasons.length ? (
          <div className="chips" style={{ marginTop: 10 }}>
            {recapSeasons.map((s) => (
              <button key={s.key} className={`chip ${state.recapSeasonKey === s.key ? 'on' : ''}`} onClick={() => setRecapSeasonKey(s.key)}>
                {t(`season.${s.season}` as TranslationKey)} {s.year}
              </button>
            ))}
          </div>
        ) : (
          <p className="muted">{t('recap.noData')}</p>
        )
      )}
      {!isSeason && (
        <div className="chips" style={{ marginTop: 10 }}>
          <button className={`chip ${state.recapOffset === 0 ? 'on' : ''}`} onClick={() => setRecapOffset(0)}>
            {t(state.recapPeriod === 'day' ? 'recap.today' : 'recap.thisMonth')}
          </button>
          <button className={`chip ${state.recapOffset === -1 ? 'on' : ''}`} onClick={() => setRecapOffset(-1)}>
            {t(state.recapPeriod === 'day' ? 'recap.yesterday' : 'recap.lastMonth')}
          </button>
        </div>
      )}

      <div className="tile t-ink hero" style={{ marginTop: 14 }}>
        <div className="dot" style={{ ...userAvatarStyle({ avatarUrl }), width: 64, height: 64, fontSize: 22 }}>{(name || '?')[0]}</div>
        <h1 style={{ marginTop: 14 }}>{name}</h1>
        <p className="muted">{t(PERIOD_KEY[state.recapPeriod])} {t('recap.periodLabel')}</p>
        {r && <span className="pill">{r.trackCount > 0 ? vibe : t('recap.vibeEmpty')}</span>}
      </div>

      {locked ? (
        <div className="tile t-soft2 empty" style={{ marginTop: 14 }}>
          <span className="num" style={{ fontSize: 54 }}>🔒</span>
          <h3>{t('recap.lockedTitle', { name: name || '' })}</h3>
          <p className="muted">{t('recap.lockedHint')}</p>
        </div>
      ) : !r ? (
        <p className="muted" style={{ marginTop: 14 }}>{t('recap.loading')}</p>
      ) : (
        <>
          <div className="stats3">
            <div className="tile"><span className="num">{r.minutes.toLocaleString()}</span><small className="muted">{t('recap.minutes')}</small></div>
            <div className="tile"><span className="num">{r.uniqueArtists}</span><small className="muted">{t('recap.artists')}</small></div>
            <div className="tile"><span className="num">{r.topGenres.length}</span><small className="muted">{t('recap.genresCount')}</small></div>
            <div className="tile"><span className="num">{r.trackCount}</span><small className="muted">{t('recap.plays')}</small></div>
          </div>

          {r.topSongs[0] && (
            <div className="tile t-ac" onClick={() => trackRowClick(r.topSongs[0].albumId)} style={{ cursor: 'pointer', marginBottom: 14 }}>
              <div className="pvw">
                <PreviewButton tracks={[{ title: r.topSongs[0].title, artist: r.topSongs[0].artist, cover: r.topSongs[0].cover, albumId: r.topSongs[0].albumId }]} size={52} />
                <div>
                  <div className="eyebrow">{t('recap.songOfWeek')}</div>
                  <h3>{r.topSongs[0].title}</h3>
                  <p>{r.topSongs[0].artist}</p>
                </div>
              </div>
            </div>
          )}

          <div className="bento b3">
            <div className="tile">
              <h3>{t('recap.topArtists')}</h3>
              <div className="stack" style={{ marginTop: 10 }}>
                {r.topArtists.length ? r.topArtists.map((a, i) => (
                  <button className="row" key={`${a.id ?? a.name}-${i}`} onClick={() => artistRowClick(a.id)} style={{ cursor: a.id ? 'pointer' : 'default' }}>
                    <span className="muted" style={{ width: 20 }}>{i + 1}</span>
                    <CoverArt url={a.cover ?? undefined} fallbackLetter={a.name[0] || '?'} className="cov" style={{ width: 36, height: 36 }} />
                    <div className="g"><b>{a.name}</b></div>
                    <small className="muted">{t('stats.playsCount', { count: a.plays })}</small>
                  </button>
                )) : <p className="muted">{t('recap.noData')}</p>}
              </div>
            </div>
            <div className="tile">
              <h3>{t('recap.topSongs')}</h3>
              <div className="stack" style={{ marginTop: 10 }}>
                {r.topSongs.length ? r.topSongs.map((s, i) => {
                  const album = s.albumId ? (liveAlbums[s.albumId] || albums.find((x) => x.id === s.albumId)) : undefined;
                  return (
                    <button className="row" key={`${s.albumId ?? s.title}-${i}`} onClick={() => trackRowClick(s.albumId)} style={{ cursor: s.albumId ? 'pointer' : 'default' }}>
                      <span className="muted" style={{ width: 20 }}>{i + 1}</span>
                      <CoverArt url={s.cover ?? undefined} fallbackLetter={s.artist[0] || '?'} className="cov" style={{ width: 36, height: 36 }} />
                      <div className="g"><b>{s.title}</b><div className="muted">{s.artist}{album ? ` · ${album.title}` : ''}</div></div>
                      <small className="muted">{t('stats.playsCount', { count: s.plays })}</small>
                    </button>
                  );
                }) : <p className="muted">{t('recap.noData')}</p>}
              </div>
            </div>
            <div className="tile">
              <h3>{t('recap.topGenres')}</h3>
              {r.topGenres.length ? (
                <div className="chips" style={{ marginTop: 10 }}>{r.topGenres.map((g) => <span className="chip" key={g.genre}>{g.genre} · {g.pct}%</span>)}</div>
              ) : <p className="muted">{t('recap.noData')}</p>}
            </div>
          </div>

          <div className="acts" style={{ marginTop: 14 }}>
            <PosterDownloadButton data={r} name={name || ''} periodLabel={`${t(PERIOD_KEY[state.recapPeriod])} ${t('recap.periodLabel')}`} />
            {!isMe && (
              <>
                <button className="btn ghost" onClick={() => viewFriend(targetId)}>{t('recap.viewProfileOf', { name: name || '' })}</button>
                <button className="btn ghost" onClick={() => openRecap('me')}>{t('recap.myRecap')}</button>
              </>
            )}
          </div>
        </>
      )}
    </>
  );
}
