'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '@/lib/AppContext';
import type { Device, GroupSummary } from '@/lib/types';
import { userAvatarStyle } from '@/lib/format';
import { toLocale, pluralForKey, type Language } from '@/lib/i18n';
import { MascotIcon } from '../redesign/icons';

// vGroups() "since march": the month, plus the year outside the current one.
// Russian takes the genitive ("с марта"), which Intl only produces next to
// a day, so the month part is cut out of a day+month format. German keeps
// its capitalised nouns; the rest are lowercased like the prototype.
export function sinceLabel(iso: string, language: Language): string {
  const d = new Date(iso);
  const loc = toLocale(language);
  const thisYear = d.getFullYear() === new Date().getFullYear();
  let label: string;
  if (language === 'ru') {
    const month = new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'long' }).formatToParts(d).find((x) => x.type === 'month')?.value ?? '';
    label = thisYear ? month : `${month} ${d.getFullYear()}`;
  } else {
    label = new Intl.DateTimeFormat(loc, thisYear ? { month: 'long' } : { month: 'long', year: 'numeric' }).format(d);
  }
  return language === 'de' ? label : label.toLowerCase();
}

// Groups list (spec 6.6 "Groups: list"). Tapping a group opens its own
// full-screen page (GroupScreen) via viewGroup, a real navigable route —
// the previous version kept the selected group in local component state,
// so the browser's back button and a shared link to a group didn't work.
export function GroupsScreen(_props: { device: Device }) {
  const { t, language, me, viewGroup, showToast } = useApp();
  const [groups, setGroups] = useState<GroupSummary[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [firstInvite, setFirstInvite] = useState('');
  const [nameErr, setNameErr] = useState('');
  const [inviteErr, setInviteErr] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadGroups = () => {
    fetch('/api/groups').then((r) => (r.ok ? r.json() : [])).then((d: GroupSummary[]) => setGroups(d));
  };
  useEffect(() => { loadGroups(); }, []);

  useEffect(() => {
    if (!creating) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setCreating(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [creating]);

  if (!me) return null;

  const openModal = () => {
    setNewName(''); setFirstInvite(''); setNameErr(''); setInviteErr('');
    setCreating(true);
  };

  // Spec 6.6 "New group" modal (prototype #gmodal): name 2–30 characters,
  // optional first invite by handle, errors inline under each field.
  const createGroup = async () => {
    if (submitting) return;
    const name = newName.trim();
    const handle = firstInvite.trim().replace(/^@/, '');
    setNameErr(''); setInviteErr('');
    if (name.length < 2 || name.length > 30) { setNameErr(t('groups.nameLengthError')); return; }
    setSubmitting(true);
    const res = await fetch('/api/groups', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, firstInvite: handle || undefined }) });
    setSubmitting(false);
    if (res.ok) {
      const g = await res.json();
      setCreating(false);
      loadGroups();
      viewGroup(g.id);
      showToast(t('groups.created'));
      return;
    }
    const body = await res.json().catch(() => null);
    if (body?.error === 'name_length') setNameErr(t('groups.nameLengthError'));
    else if (body?.error === 'invite_not_found') setInviteErr(t('groups.handleNotFound', { handle }));
    else showToast(t('groups.createFailed'));
  };

  return (
    <>
      <p className="eyebrow muted">{t('groups.eyebrowCount', { count: groups?.length ?? 0, word: pluralForKey(language, groups?.length ?? 0, 'groups.groupOne', 'groups.groupFew', 'groups.groupMany') })}</p>
      <h1 className="big">{t('groups.title')}</h1>

      {groups === null ? (
        <p className="muted">{t('groups.loading')}</p>
      ) : (
        <div className="bento b3">
          {groups.map((g) => (
            <button className="tile gl" key={g.id} onClick={() => viewGroup(g.id)} style={{ textAlign: 'left' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                <h3>{g.name}</h3>
                {g.newPlays > 0 && <span className="tag" style={{ background: 'var(--acc)', color: 'var(--onacc)' }}>{t('groups.newPlaysTag', { count: g.newPlays })}</span>}
              </div>
              <div style={{ display: 'flex', margin: '14px 0 10px', gap: 6, flexWrap: 'wrap' }}>
                {g.members.map((m) => (
                  <span key={m.id} className="dot" style={userAvatarStyle(m)}>{!m.avatarUrl && m.name[0]}</span>
                ))}
              </div>
              <small className="muted" style={{ fontWeight: 700 }}>{t('groups.memberCount', { count: g.memberCount, word: pluralForKey(language, g.memberCount, 'groups.memberOne', 'groups.memberFew', 'groups.memberMany') })} · {t('groups.since', { date: sinceLabel(g.createdAt, language) })}</small>
              {g.topListener && (
                <p style={{ marginTop: 12, fontWeight: 700 }}>{t('groups.listenedMostWeek', { name: g.topListener.user.name, hours: g.topListener.hours })}</p>
              )}
              <p className="muted" style={{ fontWeight: 600, marginTop: 2 }}>{t('groups.voteOpenHint')}</p>
              <span style={{ display: 'inline-block', marginTop: 14, fontWeight: 800 }}>{t('groups.openGroup')} →</span>
            </button>
          ))}
          <button className="tile t-soft2 empty" onClick={openModal} style={{ minHeight: 210 }}>
            <MascotIcon />
            <h3>{t('groups.newGroup')}</h3>
            <p className="muted" style={{ fontWeight: 600 }}>{t('groups.newGroupHint')}</p>
          </button>
        </div>
      )}

      {creating && createPortal(
        <div className="modalbg" onClick={(e) => { if (e.target === e.currentTarget) setCreating(false); }}>
          <form
            className="modal tile"
            role="dialog"
            aria-modal="true"
            aria-labelledby="gmt"
            onSubmit={(e) => { e.preventDefault(); createGroup(); }}
          >
            <h2 id="gmt" style={{ marginBottom: 6 }}>{t('groups.newGroup')}</h2>
            <p className="muted" style={{ fontWeight: 600, marginBottom: 14 }}>{t('groups.modalBody')}</p>
            <label htmlFor="gname">{t('groups.nameLabel')}</label>
            <input
              className="field"
              id="gname"
              maxLength={30}
              placeholder={t('groups.nameExample')}
              value={newName}
              autoFocus
              aria-invalid={!!nameErr}
              aria-describedby="gnerr"
              onChange={(e) => setNewName(e.target.value)}
            />
            <p className="ferr" id="gnerr" role="alert">{nameErr}</p>
            <label htmlFor="gfirst" style={{ marginTop: 10 }}>{t('groups.firstInviteLabel')}</label>
            <input
              className="field"
              id="gfirst"
              placeholder="@handle"
              value={firstInvite}
              aria-invalid={!!inviteErr}
              aria-describedby="gferr"
              onChange={(e) => setFirstInvite(e.target.value)}
            />
            <p className="ferr" id="gferr" role="alert">{inviteErr}</p>
            <div className="acts">
              <button type="submit" className="btn lg" disabled={submitting}>{t('groups.createGroup')}</button>
              <button type="button" className="btn ghost lg" onClick={() => setCreating(false)}>{t('groups.cancel')}</button>
            </div>
          </form>
        </div>,
        // Portal into the .rd root: every screen inside <main class="fade">
        // runs a transform animation, which would turn it into the
        // containing block for position:fixed and shrink the backdrop to
        // the screen's own box instead of the viewport.
        document.querySelector('.rd') ?? document.body,
      )}
    </>
  );
}
