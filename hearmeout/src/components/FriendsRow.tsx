'use client';

import { useApp } from '@/lib/AppContext';
import { DEMO_PROFILES } from '@/lib/demoAccounts';

function FriendTile({ friend }: { friend: { id: string; name: string; avatarUrl: string | null } }) {
  const { viewFriend } = useApp();
  const hasPhoto = !!friend.avatarUrl;
  return (
    <div
      className={`friend-tile ${hasPhoto ? '' : 'cover-fallback'}`}
      style={hasPhoto ? { backgroundImage: `url('${friend.avatarUrl}')` } : undefined}
      onClick={() => viewFriend(friend.id)}
    >
      {!hasPhoto && <span className="fallback-letter">{(friend.name[0] || '?').toUpperCase()}</span>}
      <div className="ft-name">{friend.name}</div>
    </div>
  );
}

// Zero-friend accounts are the app's hardest moment — there's nothing to
// compare yet. A full-width banner (not another small tile easy to scroll
// past) plus the always-public demo profiles give a first-time user both a
// way out (invite someone) and something to look at right now (try the
// comparison feature on fixture data) instead of a dead end.
function InviteFriendBanner() {
  const { t, me, showToast } = useApp();

  const invite = async () => {
    const url = typeof window !== 'undefined' ? window.location.origin : 'https://hearmeout.app';
    const text = t('friends.inviteMessage', { name: me?.name?.split(' ')[0] || '', url });
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ text, url });
        return;
      } catch {
        // user cancelled the share sheet — fall through to clipboard copy
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      showToast(t('toast.inviteCopied'));
    } catch {
      showToast(text);
    }
  };

  return (
    <div className="invite-banner">
      <div>
        <div className="invite-banner-title">{t('friends.inviteBannerTitle')}</div>
        <div className="invite-banner-sub">{t('friends.inviteBannerSub')}</div>
      </div>
      <button className="btn-primary" style={{ margin: 0, flexShrink: 0, whiteSpace: 'nowrap' }} onClick={invite}>
        {t('friends.inviteBannerBtn')}
      </button>
    </div>
  );
}

export function FriendsRow() {
  const { t, me, showScreen } = useApp();
  if (!me) return null;
  const hasNoFriends = me.friends.length === 0;

  return (
    <>
      {hasNoFriends && <InviteFriendBanner />}
      <div className="friends-row">
        {hasNoFriends && DEMO_PROFILES.map((p) => <FriendTile key={p.id} friend={p} />)}
        {me.friends.map((f) => <FriendTile key={f.id} friend={f} />)}
        <button className="add-friend-tile" onClick={() => showScreen('profile')}>
          <span className="aft-btn">+</span>
          <span className="aft-label">{t('friends.addFriendsTile')}</span>
        </button>
      </div>
    </>
  );
}
