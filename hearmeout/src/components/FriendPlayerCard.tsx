'use client';

import { useApp } from '@/lib/AppContext';
import { useCachedJson } from '@/lib/cachedJson';
import { sizedImage } from '@/lib/imageSize';
import { tintStyle } from '@/lib/imageColor';
import { formatRelative, userAvatarStyle } from '@/lib/format';
import { invitePath } from '@/lib/pendingInvite';
import { PROFILE_TAB_EVENT } from '@/lib/uiEvents';
import type { ApiUser, PublicProfile } from '@/lib/types';
import { CoverArt } from './ui/CoverArt';
import { usePersonColor } from './ui/Visual';

// One friend as a player card (Home and the profile's friends): the blurred
// cover of what they play (or their colour) behind, the match as a ring
// around the photo, a live dot, their top genre, the track at the bottom.
// Styles: rev15.css .fc20.
export function FriendPlayerCard({ user, demo = false, pct }: { user: ApiUser; demo?: boolean; pct: number | null }) {
  const { t, language, viewFriend } = useApp();
  const { data: profile, failed } = useCachedJson<PublicProfile>(`/api/users/${user.id}`);
  // Hooks before the early return: a hook after it crashed the page (React
  // #300) when a demo profile turned out missing.
  const color = usePersonColor(user);
  if (demo && failed) return null; // a demo profile missing from this database
  const play = profile?.nowPlaying || profile?.lastPlayed || null;
  const live = !!profile?.nowPlaying;
  const genre = profile?.genres?.[0]?.g ?? null;
  // The match as a ring around the photo (r = 40, so the length is ~251).
  const ring = 2 * Math.PI * 40;
  const bg = play?.cover ? sizedImage(play.cover, 300) ?? play.cover : null;
  return (
    <button className={`tile fc20${bg ? ' hasbg' : ''}`} style={{ ...tintStyle(color), ...(bg ? { ['--cvbg' as string]: `url('${bg}')` } : null) }} onClick={() => viewFriend(user.id)}>
      {demo && <span className="tag dm13">{t('friends.demoTag')}</span>}
      <span className="fcp">
        <svg viewBox="0 0 92 92" aria-hidden="true">
          <circle cx="46" cy="46" r="40" className="rt" />
          {pct != null && <circle cx="46" cy="46" r="40" className="rv" strokeDasharray={`${(ring * Math.max(0, Math.min(100, pct))) / 100} ${ring}`} />}
        </svg>
        <span className="avt" style={{ ...userAvatarStyle(user), backgroundSize: 'cover' }}>{!user.avatarUrl && user.name[0]?.toUpperCase()}</span>
        {live && <i className="lv" aria-label={t('friend.listeningNow')} />}
      </span>
      <b className="nm">{user.name}</b>
      {pct != null && <span className="mt"><b>{pct}%</b> {t('home.matchWord')}</span>}
      {genre && <span className="gn">{genre}</span>}
      {play && (
        <span className="np">
          <CoverArt url={play.cover ?? undefined} fallbackLetter={play.artist[0] || '?'} className="cov" px={64} style={{ width: 34, height: 34, flex: 'none' }} />
          <span className="g">
            <small className={live ? 'on' : ''}>{live ? t('friend.listeningNow') : formatRelative(play.startedAt, language)}</small>
            <b>{play.title}</b>
          </span>
        </span>
      )}
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
