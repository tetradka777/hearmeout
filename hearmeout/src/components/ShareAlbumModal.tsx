'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '@/lib/AppContext';
import { userAvatarStyle } from '@/lib/format';
import { CloseIcon } from './ui/Icons';
import { CoverArt } from './ui/CoverArt';

// "Share album": pick friends (and add a note) to send it to — each gets a
// notification and a push — or copy / share the album's link.
export function ShareAlbumModal({ album, onClose }: {
  album: { id: string; title: string; artist: string; cover: string | null };
  onClose: () => void;
}) {
  const { t, me, showToast } = useApp();
  const [picked, setPicked] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const friends = me?.friends ?? [];
  const url = `${typeof window !== 'undefined' ? window.location.origin : 'https://hearmeoutt.art'}/?screen=rate&id=${encodeURIComponent(album.id)}`;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const send = async () => {
    if (!picked.length || busy) return;
    setBusy(true);
    const res = await fetch('/api/notifications', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'album', to: picked, albumId: album.id, title: album.title, artist: album.artist, cover: album.cover, note }),
    }).catch(() => null);
    setBusy(false);
    if (res?.status === 429) { showToast(t('share.tooMany')); return; }
    if (!res?.ok) { showToast(t('share.failed')); return; }
    const d = await res.json().catch(() => ({}));
    showToast(d.sent ? t('share.sent', { n: d.sent }) : t('share.already'));
    onClose();
  };

  // The phone's own share sheet when there is one, else the clipboard.
  const shareLink = async () => {
    const text = t('share.linkText', { title: album.title, artist: album.artist });
    try {
      if (navigator.share) { await navigator.share({ title: album.title, text, url }); return; }
      await navigator.clipboard.writeText(url);
      showToast(t('share.copied'));
    } catch {
      // The share sheet was closed, or the clipboard refused: nothing to do.
    }
  };

  if (typeof document === 'undefined' || !document.querySelector('.rd')) return null;
  return createPortal(
    <div className="modalbg" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal tile sha19" role="dialog" aria-modal="true" aria-labelledby="shat">
        <div className="hd">
          <CoverArt url={album.cover ?? undefined} fallbackLetter={album.artist[0] || '?'} className="cov" px={120} style={{ width: 56, height: 56, flex: 'none' }} />
          <div className="g">
            <h2 id="shat">{t('share.title')}</h2>
            <small className="muted">{album.title} · {album.artist}</small>
          </div>
          <button className="ib" onClick={onClose} aria-label={t('recap.close')}><CloseIcon /></button>
        </div>
        {friends.length ? (
          <>
            <p className="k">{t('share.toFriends')}</p>
            <div className="frs">
              {friends.map((f) => {
                const on = picked.includes(f.id);
                return (
                  <button key={f.id} className={on ? 'on' : ''} aria-pressed={on} onClick={() => toggle(f.id)}>
                    <span className="dot" style={{ ...userAvatarStyle(f), backgroundSize: 'cover' }}>{!f.avatarUrl && f.name[0]?.toUpperCase()}</span>
                    <small>{f.name}</small>
                    {on && <i className="ic ic-check" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
            <input className="field" maxLength={200} placeholder={t('share.notePlaceholder')} value={note} onChange={(e) => setNote(e.target.value)} />
            <button className="btn" disabled={!picked.length || busy} onClick={send}>
              {picked.length ? t('share.sendTo', { n: picked.length }) : t('share.pickFriends')}
            </button>
          </>
        ) : <p className="muted" style={{ fontWeight: 600 }}>{t('share.noFriends')}</p>}
        <button className="btn ghost" onClick={shareLink}>{t('share.link')}</button>
      </div>
    </div>,
    document.querySelector('.rd')!,
  );
}
