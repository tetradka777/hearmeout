'use client';

import { useState } from 'react';
import { useApp } from '@/lib/AppContext';
import { QuickModeToggle } from './QuickModeToggle';
import { NotificationsModal } from './NotificationsModal';
import { BellIcon, GearIcon } from './icons';

// The top right corner: three separate round buttons — notifications
// (with the unread count), light/dark, settings. Profile, friend requests
// and Listen later live in the profile (the tab bar's photo); signing out
// is in Settings.
export function TopButtons() {
  const { t, me, showScreen, notifications, state } = useApp();
  const [showNotifications, setShowNotifications] = useState(false);
  if (!me) return null;
  const unread = notifications.unread;
  return (
    <>
      <span className="tb15">
        <button className="ib" onClick={() => setShowNotifications(true)} aria-label={[t('notify.title'), unread ? t('notify.unreadAria', { count: unread }) : ''].filter(Boolean).join(' · ')}>
          <BellIcon />
        </button>
        {unread > 0 && <span className="badge" aria-hidden="true">{unread > 9 ? '9+' : unread}</span>}
      </span>
      <QuickModeToggle />
      <button className={`ib${state.activeScreen === 'settings' ? ' on' : ''}`} onClick={() => showScreen('settings')} aria-label={t('settings.menuSettings')}>
        <GearIcon />
      </button>
      {showNotifications && <NotificationsModal onClose={() => setShowNotifications(false)} />}
    </>
  );
}
