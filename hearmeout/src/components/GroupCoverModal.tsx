'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '@/lib/AppContext';
import { useAlbums } from '@/lib/useAlbum';
import { blurStyle } from '@/lib/imageColor';
import { squareImageDataUrl } from '@/lib/imageResize';
import { CloseIcon } from './ui/Icons';
import { CoverArt } from './ui/CoverArt';

// The group's cover: one of the albums the group (or you) rated lately, or a
// picture from the device — shrunk here to 480px, it is only ever shown
// blurred. "Back to the best album" clears it.
export function GroupCoverModal({ groupId, name, current, fallback, albumIds, onClose, onSaved }: {
  groupId: string;
  name: string;
  current: string | null;
  fallback: string | null;
  albumIds: string[];
  onClose: () => void;
  onSaved: (cover: string | null) => void;
}) {
  const { t, spotifyCovers, showToast } = useApp();
  const [picked, setPicked] = useState<string | null>(current);
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const known = useAlbums(albumIds);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    const url = await squareImageDataUrl(f, 480, 0.8);
    if (!url) { showToast(t('groups.coverBadFile')); return; }
    setPicked(url);
  };

  const save = async () => {
    if (busy) return;
    setBusy(true);
    const res = await fetch(`/api/groups/${groupId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cover: picked }),
    }).catch(() => null);
    setBusy(false);
    if (res?.status === 503) { showToast(t('groups.coverNotReady')); return; }
    if (!res?.ok) { showToast(t('groups.coverFailed')); return; }
    showToast(t('groups.coverSaved'));
    onSaved(picked);
    onClose();
  };

  const preview = picked ?? fallback;
  // One album can be here under two ids (catalog and Spotify): one tile per cover.
  const seen = new Set<string>();
  if (typeof document === 'undefined' || !document.querySelector('.rd')) return null;
  return createPortal(
    <div className="modalbg" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal tile gcm22" role="dialog" aria-modal="true" aria-labelledby="gcmt">
        <div className="hd">
          <h2 id="gcmt">{t('groups.coverTitle')}</h2>
          <button className="ib" onClick={onClose} aria-label={t('recap.close')}><CloseIcon /></button>
        </div>
        <div className={`pv ${preview ? 'bh15' : 't-ink glow'}`} style={blurStyle(preview)}>
          <b>{name}</b>
        </div>
        <p className="k">{t('groups.coverAlbums')}</p>
        <div className="grd">
          {known.map(({ id, album }) => {
            const url = spotifyCovers[album.id] || album.cover;
            if (!url || seen.has(url)) return null;
            seen.add(url);
            const on = picked === url;
            return (
              <button key={id} className={on ? 'on' : ''} aria-pressed={on} aria-label={album.title} onClick={() => setPicked(url)}>
                <CoverArt url={url} fallbackLetter={album.artist[0] || '?'} className="cov" px={150} style={{ width: '100%', height: '100%' }} />
                {on && <i className="ic ic-check" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
        <input ref={file} type="file" accept="image/*" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
        <div className="acts">
          <button className="btn ghost" onClick={() => file.current?.click()}><i className="ic ic-pic" aria-hidden="true" /> {t('groups.coverUpload')}</button>
          {picked && <button className="btn ghost" onClick={() => setPicked(null)}>{t('groups.coverReset')}</button>}
        </div>
        <button className="btn" disabled={busy || picked === current} onClick={save}>{t('groups.coverSave')}</button>
      </div>
    </div>,
    document.querySelector('.rd')!,
  );
}
