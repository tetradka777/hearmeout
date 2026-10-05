'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '@/lib/AppContext';
import { formatRelative, userAvatarStyle } from '@/lib/format';
import type { AppNotification, RecapPeriod } from '@/lib/types';
import type { TranslationKey } from '@/lib/i18n';
import { CloseIcon } from '../ui/Icons';

const PERIOD_KEY: Record<RecapPeriod, TranslationKey> = { day: 'recap.day', week: 'recap.week', month: 'recap.month', season: 'recap.season' };

// In-app notifications list (migration 021), opened from the avatar menu.
// Opening it marks everything read. A "hi" opens the friend's profile, a
// shared recap opens that friend's recap for the shared period.
// Portaled into .rd for the same reason as the New group modal: screens
// animate a transform, which would trap position:fixed.
export function NotificationsModal({ onClose }: { onClose: () => void }) {
  const { t, language, notifications, markNotificationsRead, viewFriend, openRecap, setRecapOffset } = useApp();

  useEffect(() => {
    markNotificationsRead();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const open = (n: AppNotification) => {
    onClose();
    if (n.kind === 'recap') {
      openRecap(n.actor.id, n.payload.period ?? 'week');
      if (n.payload.offset) setRecapOffset(n.payload.offset);
    } else {
      viewFriend(n.actor.id);
    }
  };

  return createPortal(
    <div className="modalbg" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal tile" role="dialog" aria-modal="true" aria-labelledby="ntitle">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 10 }}>
          <h2 id="ntitle" style={{ margin: 0 }}>{t('notify.title')}</h2>
          <button className="ib" onClick={onClose} aria-label={t('recap.close')}><CloseIcon /></button>
        </div>
        {notifications.items.length ? notifications.items.map((n) => (
          <button className="row" key={n.id} onClick={() => open(n)} style={{ width: '100%', textAlign: 'left', fontWeight: n.read ? 600 : 800 }}>
            <span className="avt" style={{ ...userAvatarStyle(n.actor), width: 34, height: 34, fontSize: 14 }}>{n.actor.name[0]?.toUpperCase()}</span>
            <span className="g">
              <b>{n.kind === 'hi'
                ? t('notify.hiFrom', { name: n.actor.name })
                : t('notify.recapFrom', { name: n.actor.name, period: t(PERIOD_KEY[n.payload.period ?? 'week']).toLowerCase() })}</b>
              <small className="muted" style={{ fontWeight: 600 }}>{formatRelative(n.createdAt, language)}</small>
            </span>
            {n.kind === 'recap' && <span className="tag">{t('notify.open')}</span>}
          </button>
        )) : <p className="muted" style={{ fontWeight: 600 }}>{t('notify.empty')}</p>}
      </div>
    </div>,
    document.querySelector('.rd') ?? document.body,
  );
}
