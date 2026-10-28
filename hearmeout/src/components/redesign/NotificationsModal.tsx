'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '@/lib/AppContext';
import { formatRelative, userAvatarStyle } from '@/lib/format';
import type { AppNotification, RecapPeriod } from '@/lib/types';
import { quoted, type TranslationKey } from '@/lib/i18n';
import { CloseIcon } from '../ui/Icons';
import { CoverArt } from '../ui/CoverArt';

const PERIOD_KEY: Record<RecapPeriod, TranslationKey> = { day: 'recap.day', week: 'recap.week', month: 'recap.month', season: 'recap.season', year: 'recap.year' };
const REACTION_KEY: Record<string, TranslationKey> = { heart: 'social.rHeart', flame: 'social.rFlame', spark: 'social.rSpark', repeat: 'social.rRepeat', star: 'social.rStar' };
// The kind as a small icon on the picture and a word above the text.
const KIND: Record<AppNotification['kind'], { icon: string; label: TranslationKey }> = {
  release: { icon: 'disc', label: 'notify.kRelease' },
  album: { icon: 'note', label: 'notify.kAlbum' },
  hi: { icon: 'smile', label: 'notify.kHi' },
  recap: { icon: 'spark', label: 'notify.kRecap' },
  comment: { icon: 'chat', label: 'notify.kComment' },
  reaction: { icon: 'heart', label: 'notify.kReaction' },
  later: { icon: 'clock', label: 'notify.kLater' },
};

// In-app notifications (migration 021), opened from the bell. Opening it
// marks everything read; what was unread at that moment stays under "new"
// while it's open. A "hi" opens the friend's profile, a shared recap opens
// that friend's recap, a new release (migration 028) or a shared album
// opens the album. A sheet from the bottom on a phone, a panel on a
// computer; the header stays put and the list scrolls on its own.
// Portaled into .rd for the same reason as the New group modal: screens
// animate a transform, which would trap position:fixed.
export function NotificationsModal({ onClose }: { onClose: () => void }) {
  const { t, language, me, notifications, markNotificationsRead, viewFriend, openRecap, openAlbum, viewGroup } = useApp();
  const [unreadAtOpen] = useState(() => new Set(notifications.items.filter((n) => !n.read).map((n) => n.id)));

  useEffect(() => {
    markNotificationsRead();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    // The page under the dialog doesn't scroll while it's open.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prevOverflow; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const open = (n: AppNotification) => {
    onClose();
    if (n.kind === 'release' || n.kind === 'album' || n.kind === 'later') {
      if (n.payload.albumId) openAlbum(n.payload.albumId);
    } else if (!n.actor) {
      return;
    } else if ((n.kind === 'comment' || n.kind === 'reaction') && n.payload.target) {
      // What was commented on or reacted to (lib/social targets).
      const [type, a, b] = n.payload.target.split(':');
      if (type === 'review' || type === 'play') openAlbum(b);
      else if (type === 'recap') openRecap(a === me?.id ? 'me' : a, b as RecapPeriod);
      else if (type === 'award') viewGroup(a);
    } else if (n.kind === 'recap') {
      openRecap(n.actor.id, n.payload.period ?? 'week');
    } else {
      viewFriend(n.actor.id);
    }
  };

  const row = (n: AppNotification) => {
    const music = n.kind === 'release' || n.kind === 'album' || !n.actor;
    const kind = KIND[n.kind] ?? KIND.hi;
    // Albums: the title big, the artist under it; people: the sentence.
    const main = music
      ? n.payload.title ?? ''
      : n.kind === 'comment'
        ? t('notify.comment', { name: n.actor!.name, text: n.payload.preview ?? '' })
      : n.kind === 'reaction'
        ? t('notify.reaction', { name: n.actor!.name, reaction: t(REACTION_KEY[n.payload.reaction ?? ''] ?? 'social.rHeart').toLowerCase() })
      : n.kind === 'hi'
        ? t('notify.hiFrom', { name: n.actor!.name })
        : t('notify.recapFrom', { name: n.actor!.name, period: t(PERIOD_KEY[n.payload.period ?? 'week']).toLowerCase() });
    const label = n.kind === 'album' && n.actor ? t('notify.kAlbum', { name: n.actor.name }) : t(n.kind === 'later' ? 'notify.kLater' : n.kind === 'release' || !n.actor ? 'notify.kRelease' : kind.label);
    return (
      <button className={`nfr${unreadAtOpen.has(n.id) ? ' un' : ''}`} key={n.id} onClick={() => open(n)}>
        <span className="pic">
          {music
            ? <CoverArt url={n.payload.cover ?? undefined} fallbackLetter={(n.payload.artist || '?')[0]} className="cov" px={56} />
            : <span className="avt" style={userAvatarStyle(n.actor!)}>{!n.actor!.avatarUrl && n.actor!.name[0]?.toUpperCase()}</span>}
          <span className="kd" aria-hidden="true"><i className={`ic ic-${n.kind === 'later' ? 'clock' : music ? (n.kind === 'album' ? 'note' : 'disc') : kind.icon}`} /></span>
        </span>
        <span className="g">
          <small className="k">{label} · {formatRelative(n.createdAt, language)}</small>
          <b>{main}</b>
          {music && n.payload.artist && <small className="sub">{n.payload.artist}</small>}
          {n.kind === 'album' && n.payload.note && <small className="nt19">{quoted(language, n.payload.note)}</small>}
        </span>
        <i className="ic ic-chev" aria-hidden="true" />
      </button>
    );
  };

  const fresh = notifications.items.filter((n) => unreadAtOpen.has(n.id));
  const earlier = notifications.items.filter((n) => !unreadAtOpen.has(n.id));

  return createPortal(
    <div className="modalbg nfbg" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal tile nf20" role="dialog" aria-modal="true" aria-labelledby="ntitle">
        <div className="nfh">
          <h2 id="ntitle">{t('notify.title')}</h2>
          <button className="ib" onClick={onClose} aria-label={t('recap.close')}><CloseIcon /></button>
        </div>
        <div className="nfl">
          {notifications.items.length ? (
            <>
              {fresh.length > 0 && <><p className="nfs">{t('notify.new')}</p>{fresh.map(row)}</>}
              {earlier.length > 0 && <>{fresh.length > 0 && <p className="nfs">{t('notify.earlier')}</p>}{earlier.map(row)}</>}
            </>
          ) : (
            <div className="nfe">
              <span className="bl" aria-hidden="true"><i className="ic ic-spark" /></span>
              <b>{t('notify.empty')}</b>
              <p className="muted">{t('notify.emptyHint')}</p>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.querySelector('.rd') ?? document.body,
  );
}
