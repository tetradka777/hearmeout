'use client';

import { useEffect, useRef, useState } from 'react';
import { useApp } from '@/lib/AppContext';
import { userAvatarStyle } from '@/lib/format';
import { NotificationsModal } from './NotificationsModal';

// Asks ProfileScreen (always mounted) to switch to a given tab.
export const PROFILE_TAB_EVENT = 'hmo:profile-tab';

// Avatar menu popover (spec 3.9, 13.20): Profile, Friend requests (only
// when there are incoming ones; the avatar then carries a count badge),
// Listen later (with a count tag), Settings, Sign out. Closes on
// outside click, Escape, or picking an item. Opens below the button, or
// above it when the button sits in the lower half of the screen.
export function AvatarMenu({ className = 'avt' }: { className?: string }) {
  const { t, me, showScreen, logout, laterItems, friendRequests, notifications } = useApp();
  const incoming = friendRequests.incoming.length;
  const unread = notifications.unread;
  const badge = incoming + unread;
  const [showNotifications, setShowNotifications] = useState(false);
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
        aria-label={[t('nav.profile'), incoming ? t('friends.newRequestsAria', { count: incoming }) : '', unread ? t('notify.unreadAria', { count: unread }) : ''].filter(Boolean).join(' · ')}
        style={me ? userAvatarStyle(me) : undefined}
      >
        {!me?.avatarUrl && (me?.name?.[0]?.toUpperCase() ?? '')}
      </button>
      {badge > 0 && <span className="badge" aria-hidden="true">{badge > 9 ? '9+' : badge}</span>}
      {open && (
        <div
          ref={menuRef}
          className="amenu"
          role="menu"
          style={{ position: 'absolute', right: 0, ...(openUp ? { bottom: '48px' } : { top: '48px' }) }}
        >
          <button role="menuitem" onClick={() => { showScreen('profile'); setOpen(false); }}>{t('settings.menuProfile')}</button>
          {incoming > 0 && (
            // Opens Profile on its friends tab (ProfileScreen listens for this event).
            <button role="menuitem" onClick={() => { showScreen('profile'); window.dispatchEvent(new CustomEvent(PROFILE_TAB_EVENT, { detail: 'friends' })); setOpen(false); }}>
              {t('settings.menuRequests')}<span className="tag" style={{ float: 'right', background: '#C8321F', color: '#fff' }}>{incoming}</span>
            </button>
          )}
          <button role="menuitem" onClick={() => { setShowNotifications(true); setOpen(false); }}>
            {t('notify.title')}{unread > 0 && <span className="tag" style={{ float: 'right', background: '#C8321F', color: '#fff' }}>{unread}</span>}
          </button>
          <button role="menuitem" onClick={() => { showScreen('later'); setOpen(false); }}>
            {t('nav.later')}{laterItems.length > 0 && <span className="tag" style={{ float: 'right' }}>{laterItems.length}</span>}
          </button>
          <button role="menuitem" onClick={() => { showScreen('settings'); setOpen(false); }}>{t('settings.menuSettings')}</button>
          <hr />
          <button role="menuitem" onClick={() => { setOpen(false); logout(); }}>{t('settings.menuSignOut')}</button>
        </div>
      )}
      {showNotifications && <NotificationsModal onClose={() => setShowNotifications(false)} />}
    </div>
  );
}
