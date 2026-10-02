'use client';

import { useEffect, useState } from 'react';
import { useApp } from '@/lib/AppContext';
import type { PublicProfile } from '@/lib/types';
import { computeMatch } from '@/lib/matchScore';
import { DEMO_PROFILES } from '@/lib/demoAccounts';
import { CoverArt } from './ui/CoverArt';

function FriendTile({ friend, pct }: { friend: { id: string; name: string; avatarUrl: string | null }; pct: number | null | undefined }) {
  const { t, viewFriend } = useApp();
  return (
    <button className="tile fr" onClick={() => viewFriend(friend.id)} style={{ textAlign: 'left' }}>
      <CoverArt url={friend.avatarUrl ?? undefined} fallbackLetter={(friend.name[0] || '?').toUpperCase()} className="cov" style={{ width: 54, height: 54, borderRadius: '50%' }} />
      <b style={{ display: 'block', marginTop: 10 }}>{friend.name}</b>
      <small className="muted" style={{ fontWeight: 700 }}>{pct != null ? t('home.friendMatchPct', { pct }) : '—'}</small>
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
    <div className="tile t-ac" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
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
  const [scores, setScores] = useState<Record<string, number | null>>({});
  const hasNoFriends = !!me && me.friends.length === 0;
  const shown = hasNoFriends ? DEMO_PROFILES : (me?.friends ?? []);

  useEffect(() => {
    if (!me || !shown.length) return;
    let cancelled = false;
    Promise.all(
      shown.map(async (f) => {
        const res = await fetch(`/api/users/${f.id}`);
        if (!res.ok) return [f.id, null] as const;
        const profile: PublicProfile = await res.json();
        return [f.id, computeMatch(me.genres, profile.genres)] as const;
      })
    ).then((pairs) => { if (!cancelled) setScores(Object.fromEntries(pairs)); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, hasNoFriends]);

  if (!me) return null;

  return (
    <div className="sec">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>{t('home.friendsHeader')}</h2>
        <button className="btn ghost" onClick={() => showScreen('profile')}>{t('home.addFriendsBtn')}</button>
      </div>
      {hasNoFriends && <InviteFriendBanner />}
      <div className="hrow">
        {shown.map((f) => <FriendTile key={f.id} friend={f} pct={scores[f.id]} />)}
        <button className="tile t-soft2 fr" onClick={() => showScreen('profile')} style={{ textAlign: 'left' }}>
          <div className="cov" style={{ width: 54, height: 54, borderRadius: '50%', display: 'grid', placeItems: 'center', borderStyle: 'dashed', fontSize: 28 }}>+</div>
          <b style={{ display: 'block', marginTop: 10 }}>{t('friends.addFriendsTile')}</b>
        </button>
      </div>
    </div>
  );
}
