'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '@/lib/AppContext';
import { squareImageDataUrl } from '@/lib/imageResize';
import { userAvatarStyle } from '@/lib/format';
import { Initial } from './Initial';
import { CloseIcon } from './Icons';

export function AvatarViewer({ onClose }: { onClose: () => void }) {
  const { me, t, updateAvatar, showToast } = useApp();
  const dialog = useRef<HTMLDivElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab') return;
      const buttons = Array.from(dialog.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
      const next = event.shiftKey ? buttons[buttons.length - 1] : buttons[0];
      const edge = event.shiftKey ? buttons[0] : buttons[buttons.length - 1];
      if (document.activeElement === edge || !dialog.current?.contains(document.activeElement)) { event.preventDefault(); next?.focus(); }
    };
    window.addEventListener('keydown', key);
    window.addEventListener('popstate', onClose);
    return () => { window.removeEventListener('keydown', key); window.removeEventListener('popstate', onClose); document.body.style.overflow = overflow; previous?.focus({ preventScroll: true }); };
  }, [onClose]);
  const host = typeof document !== 'undefined' ? document.querySelector('.rd') : null;
  if (!me || !host) return null;
  return createPortal(<div className="modalbg avatar40back" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="avatar40dialog" role="dialog" aria-modal="true" aria-label={t('profile.viewPhoto')} ref={dialog}>
      <button className="ib avatar40close" onClick={onClose} aria-label={t('profile.closePhoto')}><CloseIcon /></button>
      <span className="avatar40image" style={{ ...userAvatarStyle(me), backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' }}>{!me.avatarUrl && <Initial name={me.name} />}</span>
      <button className="ib avatar40edit" onClick={() => file.current?.click()} disabled={busy} aria-busy={busy} aria-label={t('profile.uploadPhoto')}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m15 5 4 4M4 20l5-1L21 7a2.8 2.8 0 0 0-4-4L5 15l-1 5Z" /></svg>
      </button>
      <input ref={file} type="file" accept="image/*" hidden onChange={async event => {
        const image = event.target.files?.[0]; event.target.value = '';
        if (!image || busy) return;
        setBusy(true);
        try { const resized = await squareImageDataUrl(image); if (!resized || !(await updateAvatar(resized))) showToast(t('profile.photoFailed')); }
        catch { showToast(t('profile.photoFailed')); }
        finally { setBusy(false); }
      }} />
    </div>
  </div>, host);
}
