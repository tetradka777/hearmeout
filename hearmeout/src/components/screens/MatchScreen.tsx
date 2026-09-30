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
      <h1 className="big">{t('match.title')}</h1>

      <div className="two">
        <div className="tile">
          <h3>{t('match.title')}</h3>
          {!me.friends.length ? (
            <div className="empty" style={{ marginTop: 10 }}>
              <p>{t('friends.empty')}</p>
              <button className="btn" onClick={() => showScreen('profile')}>{t('friends.addFriendsTile')}</button>
            </div>
          ) : (
            <div className="stack" style={{ marginTop: 10 }}>
              {sorted.map((f) => (
                <button className="row" key={f.id} onClick={() => viewFriend(f.id)} style={{ cursor: 'pointer' }}>
                  <div className="dot" style={userAvatarStyle(f)}>{f.name[0]}</div>
                  <div className="g"><b>{f.name}</b><div className="muted">{f.handle}</div></div>
                  <span className="num" style={{ fontSize: 22 }}>{scores[f.id] != null ? `${scores[f.id]}%` : '—'}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {discover !== null && discover.length > 0 && (
          <div className="tile">
            <h3>{t('match.discoverTitle')}</h3>
            <p className="muted">{t('match.discoverSubtitle')}</p>
            <div className="stack" style={{ marginTop: 10 }}>
              {discover.map((p) => (
                <div className="row" key={p.id}>
                  <button className="rowlink" onClick={() => viewFriend(p.id)}>
                    <div className="dot" style={userAvatarStyle(p)}>{p.name[0]}</div>
                    <div className="g"><b>{p.name}</b><div className="muted">{t('match.sharedAlbums', { count: p.sharedAlbums })}</div></div>
                  </button>
                  <span className="num" style={{ fontSize: 18 }}>{p.score}%</span>
                  <button className="chip" onClick={() => addFriend(p.handle)}>{t('friend.addThem')}</button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="sec">
        <div className="setrow" style={{ border: 0, padding: 0 }}>
          <h2 style={{ marginBottom: 0 }}>{t('nav.groups')}</h2>
          <button className="btn ghost" onClick={() => showScreen('groups')}>{t('groups.openAll')}</button>
        </div>
        {groups === null ? (
          <p className="muted">{t('groups.loading')}</p>
        ) : !groups.length ? (
          <div className="tile empty"><p>{t('groups.noneYet')}</p></div>
        ) : (
          <div className="bento b3">
            {groups.slice(0, 3).map((g) => (
              <button className="tile" key={g.id} onClick={() => showScreen('groups')} style={{ textAlign: 'left', cursor: 'pointer' }}>
                <h3>{g.name}</h3>
                <p className="muted">{t('groups.memberCount', { count: g.memberCount })}</p>
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
