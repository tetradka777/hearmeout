'use client';

import { useEffect, useState } from 'react';
import { useApp } from '@/lib/AppContext';
import type { Device, GroupSummary } from '@/lib/types';

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
      <div className="eyebrow">{t('groups.eyebrow')}</div>
      <h1 className="big">{t('groups.title')}</h1>

      {groups === null ? (
        <p className="muted">{t('groups.loading')}</p>
      ) : (
        <div className="bento b3">
          {groups.map((g) => (
            <button className="tile" key={g.id} onClick={() => viewGroup(g.id)} style={{ textAlign: 'left', cursor: 'pointer' }}>
              <h3>{g.name}</h3>
              <p className="muted">{t('groups.memberCount', { count: g.memberCount })}</p>
              {g.newPlays > 0 && <span className="tag">{g.newPlays} new</span>}
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
            <button className="tile" onClick={() => setCreating(true)} style={{ textAlign: 'left', cursor: 'pointer', borderStyle: 'dashed' }}>
              <h3>+ {t('groups.create')}</h3>
              <p className="muted">{t('groups.newGroupHint')}</p>
            </button>
          )}
        </div>
      )}
    </>
  );
}
