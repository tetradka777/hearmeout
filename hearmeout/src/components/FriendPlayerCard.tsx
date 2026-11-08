'use client';

import { useApp } from '@/lib/AppContext';
import { useCachedJson } from '@/lib/cachedJson';
import { blurStyle } from '@/lib/imageColor';
import { tintStyle } from '@/lib/imageColor';
import { formatRelative } from '@/lib/format';
import { invitePath } from '@/lib/pendingInvite';
import { PROFILE_TAB_EVENT } from '@/lib/uiEvents';
import type { ApiUser, PublicProfile } from '@/lib/types';
import { usePersonColor } from './ui/Visual';

// A friend's photo with their real taste match and latest music timestamp.
// Missing photos retain the person's existing colour and initial.
export function FriendPlayerCard({ user, demo = false, pct }: { user: ApiUser; demo?: boolean; pct: number | null }) {
  const { t, language, viewFriend } = useApp();
  const { data: profile, failed } = useCachedJson<PublicProfile>(`/api/users/${user.id}`);
  // Hooks before the early return: a hook after it crashed the page (React
  // #300) when a demo profile turned out missing.
  const color = usePersonColor(user);
  if (demo && failed) return null; // a demo profile missing from this database
  const play = profile?.nowPlaying || profile?.lastPlayed || null;
  return (
    <button className="tile fc20 friend25" style={{ ...tintStyle(color), ...blurStyle(user.avatarUrl, 400) }} onClick={() => viewFriend(user.id)}>
      {user.avatarUrl ? <span className="photo25" style={{ backgroundImage: `url('${user.avatarUrl}')` }} /> : <span className="initial25">{user.name[0]?.toUpperCase()}</span>}
      <span className="friend25text">
        <b className="nm">{user.name}</b>
        <span className="friend25meta">{pct != null && <span className="mt">{pct}% {t('home.matchWord')}</span>}{play && <time dateTime={play.startedAt}>{formatRelative(play.startedAt, language)}</time>}</span>
      </span>
    </button>
  );
}

// The dashed "add friends" card: sends your invite link — the phone's share
// sheet, else the clipboard, else the profile's friends tab.
export function AddFriendCard() {
  const { t, me, showScreen, showToast } = useApp();
  if (!me) return null;
  const openFriendsTab = () => { showScreen('profile'); window.dispatchEvent(new CustomEvent(PROFILE_TAB_EVENT, { detail: 'friends' })); };
  const shareInvite = async () => {
    const url = `${window.location.origin}${invitePath(me)}`;
    const text = t('friends.inviteLinkMessage', { name: me.name.split(' ')[0] });
    if (navigator.share) {
      try { await navigator.share({ url, text }); return; } catch (e) { if ((e as Error)?.name === 'AbortError') return; }
    }
    try { await navigator.clipboard.writeText(`${text} ${url}`); showToast(t('toast.inviteCopied')); } catch { openFriendsTab(); }
  };
  return (
    <button className="tile fc20 add" onClick={shareInvite}>
      <span className="fcp"><span className="avt">+</span></span>
      <b className="nm">{t('friends.addFriendsTile')}</b>
      <span className="mt">{t('friends.sendInviteLink')}</span>
    </button>
  );
}
