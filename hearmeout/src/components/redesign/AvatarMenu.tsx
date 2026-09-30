'use client';

import { useEffect, useRef, useState } from 'react';
import { useApp } from '@/lib/AppContext';
import { userAvatarStyle } from '@/lib/format';
import { ProfileIcon } from '../ui/Icons';

// Avatar menu popover (spec 3.9): Profile, Settings, Sign out. Closes on
// outside click, Escape, or picking an item. Opens below the button, or
// above it when the button sits in the lower half of the screen.
export function AvatarMenu({ className = 'avt' }: { className?: string }) {
  const { t, me, showScreen, logout } = useApp();
  const [open, setOpen] = useState(false);
  const [openUp, setOpenUp] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (menuRef.current?.contains(e.target as Node) || btnRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDocClick); document.removeEventListener('keydown', onKey); };
  }, [open]);

  function toggle() {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setOpenUp(r.top > window.innerHeight / 2);
    }
    setOpen((v) => !v);
  }

  return (
    <div style={{ position: 'relative', flex: 'none' }}>
      <button
        ref={btnRef}
        className={className}
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('nav.profile')}
        style={me ? userAvatarStyle(me) : undefined}
      >
        {!me?.avatarUrl && <ProfileIcon />}
      </button>
      {open && (
        <div
          ref={menuRef}
          className="amenu"
          role="menu"
          style={{ position: 'absolute', right: 0, ...(openUp ? { bottom: '48px' } : { top: '48px' }) }}
        >
          <button role="menuitem" onClick={() => { showScreen('profile'); setOpen(false); }}>{t('settings.menuProfile')}</button>
          <button role="menuitem" onClick={() => { showScreen('settings'); setOpen(false); }}>{t('settings.menuSettings')}</button>
          <hr />
          <button role="menuitem" onClick={() => { setOpen(false); logout(); }}>{t('settings.menuSignOut')}</button>
        </div>
      )}
    </div>
  );
}
