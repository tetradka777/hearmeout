'use client';

import { useEffect, useState } from 'react';
import { useApp } from '@/lib/AppContext';
import type { PublicProfile } from '@/lib/types';
import { computeMatch } from '@/lib/matchScore';
import { DEMO_PROFILES } from '@/lib/demoAccounts';
import { userAvatarStyle } from '@/lib/format';
import { PROFILE_TAB_EVENT } from './redesign/AvatarMenu';

// friendsStrip() in reference/app.js: "Friends" + "+ Add friends", a demo
// banner for accounts with no friends yet (the strip then shows the demo
// profiles with a "Demo" tag), friend tiles with an accent letter avatar and
// "N% match", and a closing "Add friends · by handle or link" tile. Every
// add action opens Profile on its friends tab.
export function FriendsRow() {
  const { t, me, showScreen, viewFriend } = useApp();
  const [scores, setScores] = useState<Record<string, number | null>>({});
  const demo = !!me && me.friends.length === 0;
  const shown = demo ? DEMO_PROFILES : (me?.friends ?? []);

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
  }, [me, demo]);

  if (!me) return null;
  const openFriendsTab = () => { showScreen('profile'); window.dispatchEvent(new CustomEvent(PROFILE_TAB_EVENT, { detail: 'friends' })); };

  return (
    <div className="sec">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>{t('home.friendsHeader')}</h2>
        <button className="btn ghost" onClick={openFriendsTab}>{t('home.addFriendsBtn')}</button>
      </div>
      {demo && (
        <div className="tile t-ac" style={{ marginBottom: 14, display: 'flex', gap: 14, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <div>
            <h3>{t('friends.inviteBannerTitle')}</h3>
            <p style={{ fontWeight: 700, marginTop: 4 }}>{t('friends.inviteBannerSub')}</p>
          </div>
          <button className="btn" onClick={openFriendsTab}>{t('friends.inviteBannerBtn')}</button>
        </div>
      )}
      <div className="hrow">
        {shown.map((f) => (
          <button key={f.id} className="tile fr" onClick={() => viewFriend(f.id)} style={{ textAlign: 'left' }}>
            {demo && <span className="tag" style={{ position: 'absolute', top: 12, right: 12 }}>{t('friends.demoTag')}</span>}
            <span className="avt" style={{ ...userAvatarStyle(f), width: 54, height: 54, fontSize: 22, backgroundSize: 'cover' }}>{!f.avatarUrl && f.name[0].toUpperCase()}</span>
            <b style={{ display: 'block', marginTop: 10 }}>{f.name}</b>
            <small className="muted" style={{ fontWeight: 700 }}>{scores[f.id] != null ? t('home.friendMatchPct', { pct: scores[f.id]! }) : '—'}</small>
          </button>
        ))}
        <button className="tile t-soft2 fr" onClick={openFriendsTab} style={{ textAlign: 'left' }}>
          <span className="avt" style={{ width: 54, height: 54, fontSize: 28 }}>+</span>
          <b style={{ display: 'block', marginTop: 10 }}>{t('friends.addFriendsTile')}</b>
          <small className="muted" style={{ fontWeight: 700 }}>{t('friends.byHandleOrLink')}</small>
        </button>
      </div>
    </div>
  );
}
