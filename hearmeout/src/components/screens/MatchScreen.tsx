'use client';

import { useEffect, useState } from 'react';
import { useApp } from '@/lib/AppContext';
import type { Device, DiscoverMatchPerson, GroupSummary, PublicProfile } from '@/lib/types';
import { userAvatarStyle } from '@/lib/format';
import { computeMatch } from '@/lib/matchScore';

export function MatchScreen(_props: { device: Device }) {
  const { t, me, viewFriend, showScreen, addFriend } = useApp();
  const [scores, setScores] = useState<Record<string, number | null>>({});
  const [groups, setGroups] = useState<GroupSummary[] | null>(null);
  const [discover, setDiscover] = useState<DiscoverMatchPerson[] | null>(null);

  useEffect(() => {
    if (!me) return;
    let cancelled = false;
    Promise.all(
      me.friends.map(async (f) => {
        const res = await fetch(`/api/users/${f.id}`);
        if (!res.ok) return [f.id, null] as const;
        const profile: PublicProfile = await res.json();
        return [f.id, computeMatch(me.genres, profile.genres)] as const;
      })
    ).then((pairs) => { if (!cancelled) setScores(Object.fromEntries(pairs)); });
    return () => { cancelled = true; };
  }, [me]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/groups').then((r) => (r.ok ? r.json() : [])).then((d) => { if (!cancelled) setGroups(d); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!me) return;
    let cancelled = false;
    fetch('/api/match/discover').then((r) => (r.ok ? r.json() : { people: [] })).then((d) => { if (!cancelled) setDiscover(d.people); });
    return () => { cancelled = true; };
  }, [me]);

  if (!me) return null;

  const sorted = [...me.friends].sort((a, b) => (scores[b.id] ?? -1) - (scores[a.id] ?? -1));

  return (
    <>
      <div className="eyebrow">{t('match.eyebrow')}</div>
      <h1 className="page-title">{t('match.title')}</h1>

      {!me.friends.length ? (
        <div className="empty-state">
          {t('friends.empty')}
          <div style={{ marginTop: 10 }}><button className="btn-primary" style={{ margin: '0 auto' }} onClick={() => showScreen('profile')}>{t('friends.addFriendsTile')}</button></div>
        </div>
      ) : (
        sorted.map((f) => (
          <div className="match-row" key={f.id} onClick={() => viewFriend(f.id)}>
            <div className="avatar-sm" style={userAvatarStyle(f)} />
            <div className="info">
              <div className="n">{f.name}</div>
              <div className="h">{f.handle}</div>
            </div>
            <div className="match-pct">
              {scores[f.id] != null ? `${scores[f.id]}%` : '—'}
            </div>
          </div>
        ))
      )}

      {discover !== null && discover.length > 0 && (
        <>
          <div className="section-head" style={{ marginTop: 26 }}><h2>{t('match.discoverTitle')}</h2><span>{t('match.discoverSubtitle')}</span></div>
          {discover.map((p) => (
            <div className="match-row" key={p.id}>
              <div className="avatar-sm" style={userAvatarStyle(p)} onClick={() => viewFriend(p.id)} />
              <div className="info" onClick={() => viewFriend(p.id)}>
                <div className="n">{p.name}</div>
                <div className="h">{t('match.sharedAlbums', { count: p.sharedAlbums })}</div>
              </div>
              <div className="match-pct">{p.score}%</div>
              <button className="chip" onClick={() => addFriend(p.handle)}>{t('friend.addThem')}</button>
            </div>
          ))}
        </>
      )}

      <div className="section-head" style={{ marginTop: 26 }}><h2>{t('nav.groups')}</h2><span>{groups?.length ?? ''}</span></div>
      {groups === null ? (
        <div className="archive-loading">{t('groups.loading')}</div>
      ) : !groups.length ? (
        <div className="empty-state">{t('groups.noneYet')}</div>
      ) : (
        groups.slice(0, 3).map((g) => (
          <div className="friend-row" key={g.id} onClick={() => showScreen('groups')}>
            <div className="info">
              <div className="n">{g.name}</div>
              <div className="h">{t('groups.memberCount', { count: g.memberCount })}</div>
            </div>
          </div>
        ))
      )}
      <button className="btn-ghost" style={{ width: '100%', marginTop: 10 }} onClick={() => showScreen('groups')}>{t('groups.openAll')}</button>
    </>
  );
}
