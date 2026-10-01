'use client';

import { useApp } from '@/lib/AppContext';
import { DEMO_PROFILES } from '@/lib/demoAccounts';
import { CoverArt } from './ui/CoverArt';

function FriendTile({ friend }: { friend: { id: string; name: string; avatarUrl: string | null } }) {
  const { viewFriend } = useApp();
  return (
    <button className="cvw" onClick={() => viewFriend(friend.id)} style={{ textAlign: 'center' }}>
      <CoverArt url={friend.avatarUrl ?? undefined} fallbackLetter={(friend.name[0] || '?').toUpperCase()} className="cov" style={{ width: '100%', aspectRatio: '1', borderRadius: '50%' }} />
      <div style={{ marginTop: 8 }}><b>{friend.name}</b></div>
    </button>
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
    <div className="tile t-ac" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
      <div>
        <h3 style={{ marginBottom: 2 }}>{t('friends.inviteBannerTitle')}</h3>
        <p>{t('friends.inviteBannerSub')}</p>
      </div>
      <button className="btn" style={{ margin: 0, flexShrink: 0, whiteSpace: 'nowrap' }} onClick={invite}>
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
      <div className="hrow" style={{ marginTop: hasNoFriends ? 14 : 0 }}>
        {hasNoFriends && DEMO_PROFILES.map((p) => <FriendTile key={p.id} friend={p} />)}
        {me.friends.map((f) => <FriendTile key={f.id} friend={f} />)}
        <button className="cvw" onClick={() => showScreen('profile')} style={{ textAlign: 'center' }}>
          <div className="cov" style={{ width: '100%', aspectRatio: '1', borderRadius: '50%', display: 'grid', placeItems: 'center', borderStyle: 'dashed', fontSize: 28 }}>+</div>
          <div style={{ marginTop: 8 }}><small className="muted">{t('friends.addFriendsTile')}</small></div>
        </button>
      </div>
    </>
  );
}
