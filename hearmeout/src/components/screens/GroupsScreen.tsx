'use client';

import { useEffect, useState } from 'react';
import { toneClass } from '../ui/Visual';
import { createPortal } from 'react-dom';
import { useApp } from '@/lib/AppContext';
import { FanClubGrid } from '../FanClubs';
import type { Device, GroupSummary } from '@/lib/types';
import { CoverArt } from '../ui/CoverArt';
import { useAlbum, useAlbums } from '@/lib/useAlbum';
import { fmt1 } from '@/lib/numberFormat';
import { userAvatarStyle, formatRelative } from '@/lib/format';
import { toLocale, pluralForKey, type Language } from '@/lib/i18n';
import { CoverWall } from '../ui/Visual';
import { useCachedJson } from '@/lib/cachedJson';
import { blurStyle } from '@/lib/imageColor';

// vGroups() "since march": the month, plus the year outside the current one.
// German keeps its capitalised nouns; the rest are lowercased like the
// prototype.
export function sinceLabel(iso: string, language: Language): string {
  const d = new Date(iso);
  const loc = toLocale(language);
  const thisYear = d.getFullYear() === new Date().getFullYear();
  const label = new Intl.DateTimeFormat(loc, thisYear ? { month: 'long' } : { month: 'long', year: 'numeric' }).format(d);
  return language === 'de' ? label : label.toLowerCase();
}

function LeadingVote({ albumId }: { albumId: string }) {
  const { t } = useApp();
  const album = useAlbum(albumId);
  return <>{t('groups.voteLeads', { album: album?.title ?? '…' })}</>;
}

// A group card: its own colour, the people in it big, how much they
// listened this week, and the latest thing that happened — who rated which
// album (with that cover, so it's clear what it is), else the album
// leading this month's vote.
function GroupCard({ g }: { g: GroupSummary }) {
  const { t, language, viewGroup, spotifyCovers } = useApp();
  const shown = g.members.slice(0, 5);
  const more = g.members.length - shown.length;
  const last = g.recent?.[0];
  const lastAlbum = useAlbum(last?.albumId ?? null);
  return (
    <button className={`tile gc16 ${g.cover ? 'bh15' : toneClass(g.id)}`} style={blurStyle(g.cover)} onClick={() => viewGroup(g.id)}>
      <span className="avs16" aria-hidden="true">
        {shown.map((m) => <span key={m.id} className="dot" style={{ ...userAvatarStyle(m), backgroundSize: 'cover' }}>{!m.avatarUrl && m.name[0]?.toUpperCase()}</span>)}
        {more > 0 && <span className="dot more">+{more}</span>}
      </span>
      <span className="nm16">
        <h3>{g.name}</h3>
        {g.newPlays > 0 && <span className="tag" style={{ background: 'var(--acc)', color: 'var(--onacc)' }}>{t('groups.newPlaysTag', { count: g.newPlays })}</span>}
      </span>
      <small className="mt16">
        {t('groups.memberCount', { count: g.memberCount, word: pluralForKey(language, g.memberCount, 'groups.memberOne', 'groups.memberFew', 'groups.memberMany') })} · {t('groups.hoursThisWeek', { n: g.hoursWeek ?? 0 })}
      </small>
      {last && lastAlbum ? (
        <span className="ev16">
          <CoverArt url={spotifyCovers[lastAlbum.id] || lastAlbum.cover} fallbackLetter={lastAlbum.artist[0] || '?'} className="cov" px={44} style={{ width: 44, height: 44 }} />
          <span className="g">
            <small>{formatRelative(last.at, language)}</small>
            <b>{t('groups.recentRated', { name: last.user.name, album: lastAlbum.title, stars: fmt1(last.stars) })}</b>
          </span>
        </span>
      ) : (
        <small className="mt16">{g.leadingVote ? <LeadingVote albumId={g.leadingVote} /> : t('groups.voteOpenHint')}</small>
      )}
    </button>
  );
}

// "Latest in your groups": the newest ratings across all of them, as
// covers — who and the score on each, the group under it.
function LatestInGroups({ groups }: { groups: GroupSummary[] }) {
  const { t, viewGroup, spotifyCovers } = useApp();
  const items = groups.flatMap((g) => (g.recent || []).map((r) => ({ ...r, group: g })))
    .sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 6);
  const known = useAlbums(items.map((r) => r.albumId));
  if (!items.length) return null;
  return (
    <div className="sec">
      <h2>{t('groups.latestTitle')}</h2>
      <CoverWall items={items.flatMap((r) => {
        const album = known.find((k) => k.id === r.albumId)?.album;
        if (!album) return [];
        return [{
          key: `${r.group.id}-${r.albumId}-${r.at}`, cover: spotifyCovers[album.id] || album.cover, title: album.title,
          sub: `${r.user.name} · ${r.group.name}`, badge: fmt1(r.stars), onClick: () => viewGroup(r.group.id),
        }];
      })} />
    </div>
  );
}

// Groups list (spec 6.6 "Groups: list"). Tapping a group opens its own
// full-screen page (GroupScreen) via viewGroup, a real navigable route —
// the previous version kept the selected group in local component state,
// so the browser's back button and a shared link to a group didn't work.
export function GroupsScreen(_props: { device: Device }) {
  const { t, language, me, viewGroup, showToast } = useApp();
  // Shared cache (lib/cachedJson): the list shows at once and refreshes.
  const groupsQuery = useCachedJson<GroupSummary[]>('/api/groups');
  const groups = groupsQuery.data ?? (groupsQuery.failed ? [] : null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [firstInvite, setFirstInvite] = useState('');
  const [nameErr, setNameErr] = useState('');
  const [inviteErr, setInviteErr] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadGroups = () => { groupsQuery.reload(); };

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
    else if (body?.error === 'invite_not_friends') setInviteErr(t('groups.handleNotFriend', { handle }));
    else showToast(t('groups.createFailed'));
  };

  return (
    <>
      <p className="eyebrow muted">{t('groups.eyebrowCount', { count: groups?.length ?? 0, word: pluralForKey(language, groups?.length ?? 0, 'groups.groupOne', 'groups.groupFew', 'groups.groupMany') })}</p>
      <h1 className="big">{t('groups.title')}</h1>

      {groups === null ? (
        <p className="muted">{t('groups.loading')}</p>
      ) : (
        <>
          {groups.length > 0 && <div className="gl11">{groups.map((g) => <GroupCard key={g.id} g={g} />)}</div>}
          <button className="tile t-ac newg11" onClick={openModal}>
            <span className="avt" style={{ width: 40, height: 40, fontSize: 22 }}>+</span>
            <span className="g"><b>{t('groups.newGroup')}</b><small className="muted" style={{ fontWeight: 600 }}>{t('groups.newGroupHint')}</small></span>
          </button>
          <FanClubGrid />
          <LatestInGroups groups={groups} />
        </>
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
              placeholder={t('friends.handlePlaceholder')}
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
