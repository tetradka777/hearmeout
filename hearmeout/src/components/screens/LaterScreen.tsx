'use client';

import { useEffect, useState } from 'react';
import { useApp } from '@/lib/AppContext';
import type { Device, LaterItem } from '@/lib/types';
import { CoverArt } from '../ui/CoverArt';
import { MascotIcon } from '../redesign/icons';
import { PlayIcon, CheckIcon, CloseIcon } from '../ui/Icons';
import { formatRelative } from '@/lib/format';
import { pluralForKey } from '@/lib/i18n';
import type { QueueTrack } from '@/lib/PlayerContext';
import { usePlayer } from '@/lib/PlayerContext';

// Listen later (spec 13.20): a private per-account list of saved albums
// and tracks. Not a top-level tab — reached from the avatar menu and the
// Profile tab — so there's no nav highlight and no back crumb, same as
// Settings (redesign fix B6 precedent).

function useAlbumTitle(albumId: string) {
  const { albums, liveAlbums, ensureLiveAlbum } = useApp();
  useEffect(() => { ensureLiveAlbum(albumId); }, [albumId, ensureLiveAlbum]);
  return (liveAlbums[albumId] || albums.find((a) => a.id === albumId))?.title ?? null;
}

export function LaterRow({ item, onPlay }: { item: LaterItem; onPlay: (item: LaterItem) => void }) {
  const { t, language, openAlbum, removeLaterItem, showToast } = useApp();
  const albumTitle = useAlbumTitle(item.albumId);
  const subtitle = item.type === 'track' && albumTitle ? `${item.artist} · ${albumTitle}` : item.artist;

  return (
    <div className="row later-row">
      <button className="rowlink" onClick={() => openAlbum(item.albumId)}>
        <CoverArt url={item.cover ?? undefined} fallbackLetter={(item.artist || item.title)[0] || '?'} className="cov" style={{ width: 52, height: 52 }} />
        <span className="g">
          <b>{item.title}</b>
          <small className="muted" style={{ fontWeight: 600 }}>
            {subtitle} · {t('later.addedAgo', { time: formatRelative(item.createdAt, language) })}
          </small>
        </span>
        <span className="tag">{item.type === 'album' ? t('later.tagAlbum') : t('later.tagTrack')}</span>
      </button>
      <span className="later-act">
        <button className="ib" onClick={() => onPlay(item)} aria-label={t('later.playAria', { title: item.title })}>
          <PlayIcon size={16} />
        </button>
        <button
          className="ib"
          aria-label={item.type === 'album' ? t('later.listenedAlbumAria') : t('later.listenedTrackAria')}
          onClick={async () => {
            if (!(await removeLaterItem(item.id))) return;
            if (item.type === 'album') {
              openAlbum(item.albumId);
              showToast(t('toast.markedListenedAlbum'));
            } else {
              showToast(t('toast.markedListened'));
            }
          }}
        >
          <CheckIcon />
        </button>
        <button
          className="ib"
          aria-label={t('later.removeAria')}
          onClick={async () => { if (await removeLaterItem(item.id)) showToast(t('toast.removedLater')); }}
        >
          <CloseIcon />
        </button>
      </span>
    </div>
  );
}

type Filter = 'all' | 'album' | 'track';
type Sort = 'new' | 'old';

// Play button: a track plays alone, an album plays its tracklist.
export function useLaterPlay() {
  const { albums, liveAlbums, ensureLiveAlbum } = useApp();
  const { playQueue } = usePlayer();
  const play = (item: LaterItem) => {
    if (item.type === 'track') {
      const track: QueueTrack = { title: item.title, artist: item.artist ?? '', cover: item.cover, albumId: item.albumId };
      playQueue([track], 0);
      return;
    }
    const album = liveAlbums[item.albumId] || albums.find((a) => a.id === item.albumId);
    if (!album) { ensureLiveAlbum(item.albumId); return; }
    const tracks: QueueTrack[] = album.tracklist.map((tr) => ({ title: tr, artist: album.artist, cover: item.cover ?? album.cover, albumId: album.id, spotifyId: album.spotifyId }));
    if (tracks.length) playQueue(tracks, 0);
  };
  return play;
}

export function LaterScreen(_props: { device: Device }) {
  const { t, language, laterItems, removeAllLater, showToast, showScreen } = useApp();
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('new');
  const [confirmingClear, setConfirmingClear] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim().toLowerCase()), 220);
    return () => clearTimeout(timer);
  }, [query]);

  const nAlbums = laterItems.filter((i) => i.type === 'album').length;
  const nTracks = laterItems.length - nAlbums;

  const filtered = laterItems
    .filter((i) => filter === 'all' || i.type === filter)
    .filter((i) => !debouncedQuery || `${i.title} ${i.artist ?? ''}`.toLowerCase().includes(debouncedQuery))
    .sort((a, b) => (sort === 'old' ? 1 : -1) * (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()));

  const play = useLaterPlay();

  const summary = laterItems.length
    ? t('later.summaryTemplate', {
        albums: nAlbums,
        albumWord: pluralForKey(language, nAlbums, 'later.albumOne', 'later.albumFew', 'later.albumMany'),
        tracks: nTracks,
        trackWord: pluralForKey(language, nTracks, 'later.trackOne', 'later.trackFew', 'later.trackMany'),
      })
    : t('later.empty');

  return (
    <>
      <p className="eyebrow muted">{t('later.eyebrow')}</p>
      <h1 className="big">{t('nav.later')}</h1>
      <p style={{ fontWeight: 800, margin: '-6px 0 18px' }}>{summary}</p>

      <>
          <input
            className="field"
            type="search"
            placeholder={t('later.searchPlaceholder')}
            aria-label={t('later.searchAria')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ maxWidth: 420, marginBottom: 12 }}
          />
          <div className="chips" role="group" aria-label={t('later.showGroupLabel')}>
            <button className={`chip${filter === 'all' ? ' on' : ''}`} onClick={() => setFilter('all')}>{t('later.chipAll', { n: laterItems.length })}</button>
            <button className={`chip${filter === 'album' ? ' on' : ''}`} onClick={() => setFilter('album')}>{t('later.chipAlbums', { n: nAlbums })}</button>
            <button className={`chip${filter === 'track' ? ' on' : ''}`} onClick={() => setFilter('track')}>{t('later.chipTracks', { n: nTracks })}</button>
          </div>
          <div className="chips" role="group" aria-label={t('later.sortGroupLabel')}>
            <button className={`chip${sort === 'new' ? ' on' : ''}`} onClick={() => setSort('new')}>{t('later.sortNewest')}</button>
            <button className={`chip${sort === 'old' ? ' on' : ''}`} onClick={() => setSort('old')}>{t('later.sortOldest')}</button>
          </div>
      </>

      <div>
        {!laterItems.length ? (
          <div className="tile t-soft2 empty">
            <MascotIcon />
            <h3>{t('later.emptyTitle')}</h3>
            <p className="muted" style={{ fontWeight: 600 }}>{t('later.emptyBody')}</p>
            <button className="btn" onClick={() => showScreen('discover')}>{t('later.findMusic')}</button>
          </div>
        ) : !filtered.length ? (
          <div className="tile t-soft2 empty">
            <MascotIcon />
            <h3>{t('later.noMatchesTitle')}</h3>
            <p className="muted" style={{ fontWeight: 600 }}>{t('later.noMatchesBody')}</p>
            <button className="btn" onClick={() => { setFilter('all'); setQuery(''); }}>{t('later.showAll')}</button>
          </div>
        ) : (
          <div className="tile">
            {filtered.map((item) => <LaterRow key={item.id} item={item} onPlay={play} />)}
          </div>
        )}
      </div>

      {laterItems.length > 0 && (
        <div className="acts">
          {confirmingClear ? (
            <span className="conf">
              <b>{pluralForKey(language, laterItems.length, 'later.removeAllConfirmOne', 'later.removeAllConfirmFew', 'later.removeAllConfirm').replace('{n}', String(laterItems.length))}</b>
              <button className="btn danger" onClick={async () => { if (await removeAllLater()) showToast(t('toast.laterCleared')); setConfirmingClear(false); }}>{t('later.removeAll')}</button>
              <button className="btn ghost" onClick={() => setConfirmingClear(false)}>{t('later.keepThem')}</button>
            </span>
          ) : (
            <button className="btn ghost" onClick={() => setConfirmingClear(true)}>{t('later.removeAll')}</button>
          )}
        </div>
      )}
      <p className="muted" style={{ fontWeight: 600, marginTop: 14, fontSize: 14 }}>{t('later.footnote')}</p>
    </>
  );
}
