'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '@/lib/AppContext';
import { useCachedJson } from '@/lib/cachedJson';
import { useAlbums } from '@/lib/useAlbum';
import { fmt1 } from '@/lib/numberFormat';
import type { QueueAlbum } from '@/app/api/rate-queue/route';
import { CoverArt } from './ui/CoverArt';
import { ArtistName } from './ui/ArtistName';
import { CloseIcon } from './ui/Icons';
import { StarSlider } from './redesign/Stars';

// Albums skipped in the queue, per account in this browser: they don't come
// back next time (a skip isn't a score).
const skipKey = (id: string) => `hmo-rq-skip:${id}`;
function readSkipped(id: string): string[] {
  try { return JSON.parse(localStorage.getItem(skipKey(id)) || '[]'); } catch { return []; }
}
function writeSkipped(id: string, ids: string[]) {
  try { localStorage.setItem(skipKey(id), JSON.stringify(ids.slice(-500))); } catch { /* private mode */ }
}

// Your most played albums that still have no score, minus the ones you rated
// or skipped: what the queue shows.
export function useRateQueue(): QueueAlbum[] {
  const { me, myRatings, albums } = useApp();
  const { data } = useCachedJson<QueueAlbum[]>(me ? '/api/rate-queue' : null);
  const [skipped, setSkipped] = useState<string[]>([]);
  useEffect(() => {
    if (!me) return;
    setSkipped(readSkipped(me.id));
    const onSkip = () => setSkipped(readSkipped(me.id));
    window.addEventListener('hmo-rq-skip', onSkip);
    return () => window.removeEventListener('hmo-rq-skip', onSkip);
  }, [me]);
  return useMemo(() => {
    const rated = new Set<string>();
    for (const r of myRatings) {
      rated.add(r.albumId);
      const sp = albums.find((a) => a.id === r.albumId)?.spotifyId;
      if (sp) rated.add(sp);
    }
    const skip = new Set(skipped);
    return (data || []).filter((q) => !rated.has(q.albumId) && !skip.has(q.albumId));
  }, [data, myRatings, albums, skipped]);
}

// One album at a time, big: how much you played it, a slider, save → the
// next one; skip moves on without a score.
export function RateQueueModal({ onClose }: { onClose: () => void }) {
  const { t, me, publishRating, openAlbum } = useApp();
  const queue = useRateQueue();
  const [total] = useState(() => queue.length);
  const [done, setDone] = useState(0);
  const [draft, setDraft] = useState(0);
  const [busy, setBusy] = useState(false);
  const current = queue[0];
  // The current album and the next two, so their covers are ready.
  const known = useAlbums(queue.slice(0, 3).map((q) => q.albumId));
  const album = current ? known.find((k) => k.id === current.albumId)?.album : undefined;

  useEffect(() => setDraft(0), [current?.albumId]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const save = async () => {
    if (!current || !draft || busy) return;
    setBusy(true);
    await publishRating(current.albumId, draft, '');
    setBusy(false);
    setDone((n) => n + 1);
  };
  const skip = () => {
    if (!current || !me) return;
    writeSkipped(me.id, [...readSkipped(me.id), current.albumId]);
    window.dispatchEvent(new Event('hmo-rq-skip'));
  };

  if (typeof document === 'undefined' || !document.querySelector('.rd')) return null;
  return createPortal(
    <div className="modalbg" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal tile rq19" role="dialog" aria-modal="true" aria-labelledby="rqt">
        <div className="hd">
          <h2 id="rqt">{t('queue.title')}</h2>
          <button className="ib" onClick={onClose} aria-label={t('recap.close')}><CloseIcon /></button>
        </div>
        {current ? (
          <>
            <p className="pg">{t('queue.progress', { done, left: queue.length })}</p>
            <button className="cvb" onClick={() => { onClose(); openAlbum(current.albumId); }} aria-label={album?.title ?? ''}>
              <CoverArt url={album?.cover} fallbackLetter={(album?.artist || '?')[0]} className="cov" px={300} style={{ width: '100%', aspectRatio: '1' }} />
            </button>
            <b className="tt">{album?.title ?? '…'}</b>
            {album && <span className="ar"><ArtistName name={album.artist} id={album.artistId} size={18} /></span>}
            <small className="pl">{t('queue.played', { n: current.plays, h: fmt1(current.minutes / 60) })}</small>
            <div className="sl">
              <StarSlider value={draft} onChange={setDraft} size={36} />
              <b className="num">{draft ? fmt1(draft) : '–'}</b>
            </div>
            <div className="acts">
              <button className="btn" disabled={!draft || busy} onClick={save}>{t('queue.save')}</button>
              <button className="btn ghost" disabled={busy} onClick={skip}>{t('queue.skip')}</button>
            </div>
          </>
        ) : (
          <div className="end">
            <i className="ic ic-check" aria-hidden="true" />
            <b>{total || done ? t('queue.allDone', { n: done }) : t('queue.empty')}</b>
            <button className="btn" onClick={onClose}>{t('queue.close')}</button>
          </div>
        )}
      </div>
    </div>,
    document.querySelector('.rd')!,
  );
}

// Home: "N played albums are waiting for a score" when there are some.
export function RateQueueCard() {
  const { t } = useApp();
  const queue = useRateQueue();
  const [open, setOpen] = useState(false);
  const known = useAlbums(queue.slice(0, 3).map((q) => q.albumId));
  if (!queue.length) return null;
  return (
    <>
      <button className="tile rqc19" onClick={() => setOpen(true)}>
        <span className="cvs" aria-hidden="true">
          {known.map(({ id, album }) => <CoverArt key={id} url={album.cover} fallbackLetter={album.artist[0] || '?'} className="cov" px={120} style={{ width: 56, height: 56 }} />)}
        </span>
        <span className="g">
          <b>{t('queue.cardTitle', { n: queue.length })}</b>
          <small>{t('queue.cardSub')}</small>
        </span>
        <span className="op">{t('queue.start')} →</span>
      </button>
      {open && <RateQueueModal onClose={() => setOpen(false)} />}
    </>
  );
}
