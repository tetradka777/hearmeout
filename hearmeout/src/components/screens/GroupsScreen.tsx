'use client';

import { useEffect, useState } from 'react';
import { useApp } from '@/lib/AppContext';
import type { Device, GroupSummary } from '@/lib/types';
import { userAvatarStyle } from '@/lib/format';
import { MascotIcon } from '../redesign/icons';

// Groups list (spec 6.6 "Groups: list"). Tapping a group opens its own
// full-screen page (GroupScreen) via viewGroup, a real navigable route —
// the previous version kept the selected group in local component state,
// so the browser's back button and a shared link to a group didn't work.
export function GroupsScreen(_props: { device: Device }) {
  const { t, me, viewGroup, showToast } = useApp();
  const [groups, setGroups] = useState<GroupSummary[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadGroups = () => {
    fetch('/api/groups').then((r) => (r.ok ? r.json() : [])).then((d: GroupSummary[]) => setGroups(d));
  };
  useEffect(() => { loadGroups(); }, []);

  if (!me) return null;

  const createGroup = async () => {
    const name = newName.trim();
    if (!name || submitting) return;
    setSubmitting(true);
    const res = await fetch('/api/groups', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
    setSubmitting(false);
    if (res.ok) {
      const g = await res.json();
      setNewName('');
      setCreating(false);
      loadGroups();
      viewGroup(g.id);
    } else {
      showToast(t('groups.createFailed'));
    }
  };

  return (
    <>
      <div className="eyebrow">{t('groups.eyebrowCount', { count: groups?.length ?? 0 })}</div>
      <h1 className="big">{t('groups.title')}</h1>

      {groups === null ? (
        <p className="muted">{t('groups.loading')}</p>
      ) : (
        <div className="bento b3">
          {groups.map((g) => (
            <button className="tile gl" key={g.id} onClick={() => viewGroup(g.id)} style={{ textAlign: 'left', cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                <h3>{g.name}</h3>
                {g.newPlays > 0 && <span className="tag">{g.newPlays} new</span>}
              </div>
              <div className="hrow" style={{ margin: '14px 0 10px', gap: 6, flexWrap: 'wrap' }}>
                {g.members.map((m) => (
                  <span key={m.id} className="dot" style={{ ...userAvatarStyle(m), width: 32, height: 32, fontSize: 13 }}>{m.name[0]}</span>
                ))}
              </div>
              <small className="muted">{t('groups.memberCount', { count: g.memberCount })} · {t('groups.since', { date: new Date(g.createdAt).toLocaleDateString() })}</small>
              {g.topListener && (
                <p style={{ marginTop: 12, fontWeight: 700 }}>{t('groups.listenedMostWeek', { name: g.topListener.user.name, hours: g.topListener.hours })}</p>
              )}
              <p className="muted" style={{ marginTop: 2 }}>{t('groups.voteOpenHint')}</p>
              <span style={{ display: 'inline-block', marginTop: 14, fontWeight: 800 }}>{t('groups.openGroup')} →</span>
            </button>
          ))}
          {creating ? (
            <div className="tile">
              <div className="field" style={{ display: 'flex', gap: 8 }}>
                <input
                  style={{ flex: 1, background: 'transparent', border: 0 }}
                  placeholder={t('groups.namePlaceholder')}
                  value={newName}
                  autoFocus
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') createGroup(); if (e.key === 'Escape') setCreating(false); }}
                />
              </div>
              <div className="acts">
                <button className="btn" disabled={submitting} onClick={createGroup}>{t('groups.create')}</button>
                <button className="btn ghost" onClick={() => setCreating(false)}>✕</button>
              </div>
            </div>
          ) : (
            <button className="tile t-soft2 empty" onClick={() => setCreating(true)} style={{ minHeight: 210, cursor: 'pointer' }}>
              <MascotIcon />
              <h3>{t('groups.newGroup')}</h3>
              <p className="muted">{t('groups.newGroupHint')}</p>
            </button>
          )}
        </div>
      )}
    </>
  );
}
