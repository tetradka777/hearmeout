'use client';

import { useEffect, useState } from 'react';
import { fmt1 } from '@/lib/numberFormat';
import { GroupListenRace, GroupVoteCard } from '../GroupCards';
import { GroupCoverModal } from '../GroupCoverModal';
import { useApp } from '@/lib/AppContext';
import { invitePath } from '@/lib/pendingInvite';
import type { Device, GroupDetail, GroupLeaderboardPeriod } from '@/lib/types';
import { userAvatarStyle, formatRelative } from '@/lib/format';
import { toLocale, pluralForKey } from '@/lib/i18n';
import { CoverArt } from '../ui/CoverArt';
import { invalidateJson, useCachedJson } from '@/lib/cachedJson';
import { blurStyle } from '@/lib/imageColor';
import { sinceLabel } from './GroupsScreen';

// Group page (spec 6.6): a real full-screen route reached via viewGroup,
// with its own back crumb — not a locally-selected panel any more.
export function GroupScreen({ device: _device }: { device: Device }) {
  const { t, language, me, state, goBack, showScreen, albums, liveAlbums, spotifyCovers, openAlbum, showToast, viewFriend, myRatings } = useApp();
  const [inviteHandle, setInviteHandle] = useState('');
  const [inviteErr, setInviteErr] = useState('');
  const [period, setPeriod] = useState<GroupLeaderboardPeriod>('month');
  const [leavingConfirm, setLeavingConfirm] = useState(false);
  const [coverOpen, setCoverOpen] = useState(false);

  const groupId = state.viewingGroupId;

  // Shared cache (lib/cachedJson): a group the preloader already fetched
  // opens at once; after a change here the answer is fetched again.
  const groupQuery = useCachedJson<GroupDetail>(groupId ? `/api/groups/${groupId}?period=${period}` : null);
  const detail = groupQuery.data;
  const load = () => { groupQuery.reload(); };
  useEffect(() => { setCoverOpen(false); setLeavingConfirm(false); setInviteErr(''); setInviteHandle(''); setPeriod('month'); }, [groupId]);

  const changePeriod = (p: GroupLeaderboardPeriod) => setPeriod(p);

  if (!me) return null;
  if (!detail) return (
    <>
      <button className="crumb" onClick={() => goBack('groups')}>‹ {t('groups.allGroups')}</button>
      <p className="muted">{t('groups.loading')}</p>
    </>
  );

  const castVote = async (albumId: string) => {
    const alreadyMine = detail.vote.myVote === albumId;
    const res = alreadyMine
      ? await fetch(`/api/groups/${groupId}/vote`, { method: 'DELETE' })
      : await fetch(`/api/groups/${groupId}/vote`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ albumId }) });
    if (res.ok) load(); else showToast(t('groups.voteFailed'));
  };

  // Invite-by-handle errors render under the field (prototype #ginverr),
  // not as toasts; only success is toasted.
  const invite = async () => {
    const handle = inviteHandle.trim().replace(/^@/, '');
    setInviteErr('');
    if (!handle) { setInviteErr(t('groups.enterHandle')); return; }
    const res = await fetch(`/api/groups/${groupId}/members`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ handle }) });
    if (res.ok) { setInviteHandle(''); load(); showToast(t('groups.invitedHandle', { handle })); return; }
    const body = await res.json().catch(() => null);
    setInviteErr(
      body?.error === 'not_found' ? t('groups.handleNotFound', { handle })
        : body?.error === 'already_member' ? t('groups.handleAlreadyMember', { handle })
        : body?.error === 'not_friends' ? t('groups.handleNotFriend', { handle })
        : t('groups.inviteFailed'),
    );
  };

  // "Invite friends" copies the user's personal invite link (/invite/[id]).
  // clipboard.writeText can throw synchronously in some sandboxes, so the
  // fallback shows the link itself in the toast.
  const copyInviteLink = async () => {
    const url = `${window.location.origin}${invitePath(me)}`;
    try { await navigator.clipboard.writeText(url); showToast(t('groups.inviteLinkCopied')); }
    catch { showToast(url); }
  };

  const leaveGroup = async () => {
    const res = await fetch(`/api/groups/${groupId}/leave`, { method: 'POST' });
    if (res.ok) { showToast(t('groups.leftToast')); showScreen('groups'); }
  };

  const toggleMute = async () => {
    const res = await fetch(`/api/groups/${groupId}/mute`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ muted: !detail.muted }) });
    if (res.ok) load(); else showToast(t('groups.muteFailed'));
  };

  const totalHours = detail.leaderboard.reduce((s, r) => s + r.hours, 0);
  const totalRatingsThisMonth = detail.memberStats.reduce((s, m) => s + m.ratingsMonth, 0);
  const groupAvgScore = detail.memberStats.length ? detail.memberStats.reduce((s, m) => s + m.avgScore, 0) / detail.memberStats.length : 0;
  const albumMeta = (id: string) => liveAlbums[id] || albums.find((x) => x.id === id);
  const voteMonth = new Date(`${detail.vote.monthKey}-01T12:00:00`);
  const voteEnd = new Date(voteMonth.getFullYear(), voteMonth.getMonth() + 1, 0);
  const openMember = (id: string) => { if (id !== me.id) viewFriend(id); };
  const Av = ({ u }: { u: { name: string; avatarUrl: string | null } }) => <span className="dot" style={userAvatarStyle(u)}>{!u.avatarUrl && u.name[0]}</span>;

  const heroCovers = detail.topAlbums.slice(0, 3);
  // The page's top card over its best album's cover, blurred.
  const heroAlbum = heroCovers[0] ? albumMeta(heroCovers[0].albumId) : undefined;
  const heroCover = heroAlbum ? spotifyCovers[heroAlbum.id] || heroAlbum.cover : null;
  const heroBg = detail.cover || heroCover;
  // Albums to pick the cover from: the group's month, its latest ratings,
  // then your own latest.
  const coverChoices = [...new Set([...detail.topAlbums.map((x) => x.albumId), ...detail.activity.map((x) => x.albumId), ...myRatings.slice(0, 12).map((r) => r.albumId)])].slice(0, 18);
  const coverOf = (id: string | undefined, fallback?: string | null) => {
    const a = id ? albumMeta(id) : undefined;
    return (a ? spotifyCovers[a.id] || a.cover : null) || fallback || null;
  };
  const actCover = coverOf(detail.activity[0]?.albumId, detail.activity[0]?.cover);

  return (
    <>
      <button className="crumb" onClick={() => goBack('groups')}>‹ {t('groups.allGroups')}</button>

      {/* Hero: the group's name, members and numbers over its cover (its own
          picture, or the best album of the month), blurred. */}
      <div className={`tile bh15 gh23${heroBg ? '' : ' np'}`} style={blurStyle(heroBg, 300)}>
        <div className="top">
          <span className="k">{t('groups.privateGroup')} · {t('groups.since', { date: sinceLabel(detail.createdAt, language) })}</span>
          <button className="ce" onClick={() => setCoverOpen(true)}><i className="ic ic-pic" aria-hidden="true" /> {t('groups.coverEdit')}</button>
        </div>
        <div className="mid">
          <button className="cvb" onClick={() => setCoverOpen(true)} aria-label={t('groups.coverEdit')}>
            <CoverArt url={heroBg ?? undefined} fallbackLetter={detail.name[0]?.toUpperCase() || '?'} className="cov" px={150} />
          </button>
          <div className="g">
            <h1>{detail.name}</h1>
            <span className="avs">
              {detail.members.slice(0, 6).map((m) => (
                <button key={m.id} aria-label={m.name} onClick={() => openMember(m.id)}><span className="avt" style={{ ...userAvatarStyle(m), backgroundSize: 'cover' }}>{!m.avatarUrl && m.name[0]?.toUpperCase()}</span></button>
              ))}
              {detail.members.length > 6 && <span className="avt more">+{detail.members.length - 6}</span>}
            </span>
            <small>{t('groups.memberCount', { count: detail.members.length, word: pluralForKey(language, detail.members.length, 'groups.memberOne', 'groups.memberFew', 'groups.memberMany') })}</small>
          </div>
        </div>
        <div className="st15">
          <div><b>{Math.round(totalHours)}{t('unit.h')}</b><small>{t(period === 'week' ? 'groups.listenedWeek' : 'groups.listenedMonth')}</small></div>
          <div><b>{totalRatingsThisMonth}</b><small>{t('groups.ratingsThisMonth')}</small></div>
          <div><b>{groupAvgScore ? fmt1(groupAvgScore) : '–'}</b><small>{t('groups.figAvg')}</small></div>
        </div>
        <div className="acts">
          <button className="btn" onClick={copyInviteLink}>{t('groups.inviteFriends')}</button>
          <button className="btn ghost" aria-pressed={detail.muted} onClick={toggleMute}>{detail.muted ? t('groups.muted') : t('groups.muteNotifications')}</button>
        </div>
      </div>
      {coverOpen && (
        <GroupCoverModal
          groupId={detail.id}
          name={detail.name}
          current={detail.cover ?? null}
          fallback={heroCover ?? null}
          albumIds={coverChoices}
          onClose={() => setCoverOpen(false)}
          onSaved={() => { load(); invalidateJson('/api/groups'); }}
        />
      )}

      {/* The vote and who listened most, side by side on a computer. */}
      <div className="gg22">
        <GroupVoteCard
          vote={detail.vote}
          title={t('groups.voteForMonth', { month: voteMonth.toLocaleDateString(toLocale(language), { month: 'long' }) })}
          ends={t('groups.voteEnds', { date: voteEnd.toLocaleDateString(toLocale(language), { day: 'numeric', month: 'long' }) })}
          onVote={castVote}
        />
        <GroupListenRace rows={detail.leaderboard} period={period} onPeriod={changePeriod} meId={me.id} onOpen={openMember} />
      </div>

      <div className="bento b3">

        {/* Latest ratings as covers you swipe through, over the latest one. */}
        <div className={`tile s3 ${actCover ? 'bh15' : 'nt23'}`} style={blurStyle(actCover)}>
          <h2>{t('groups.activity')}</h2>
          {detail.activity.length ? (
            <div className="hrow act13">
              {detail.activity.map((ev, i) => {
                const a = albumMeta(ev.albumId);
                return (
                  <button className="act13c" key={i} onClick={() => openAlbum(ev.albumId)}>
                    <div className="cvw">
                      <CoverArt url={a?.cover ?? ev.cover ?? undefined} fallbackLetter={(a?.artist ?? ev.albumArtist)[0] || '?'} className="cov" px={150} style={{ width: '100%', aspectRatio: '1' }} />
                      <Av u={ev.user} />
                      <span className="sc13">{fmt1(ev.stars)}</span>
                    </div>
                    <b>{a?.title ?? ev.albumTitle}</b>
                    <small className="muted">{ev.user.name} {ev.type === 'review' ? t('groups.wroteAbout') : t('groups.rated')}</small>
                    <small className="muted">{formatRelative(ev.createdAt, language)}</small>
                  </button>
                );
              })}
            </div>
          ) : <p className="muted" style={{ fontWeight: 600 }}>{t('groups.noActivity')}</p>}
        </div>

        {/* Managing the group: invite by handle, leave. */}
        <div className="tile nt23 s3">
          <div className="mng13">
            <div className="inv">
              <label htmlFor="ginv" style={{ fontWeight: 800 }}>{t('groups.inviteByHandle')}</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
                <input className="field" id="ginv" style={{ flex: 1, minWidth: 150 }} placeholder={t('friends.handlePlaceholder')} value={inviteHandle} aria-invalid={!!inviteErr} aria-describedby="ginverr" onChange={(e) => setInviteHandle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') invite(); }} />
                <button className="btn" onClick={invite}>{t('groups.invite')}</button>
              </div>
              <p className="ferr" id="ginverr" role="alert">{inviteErr}</p>
            </div>
            {leavingConfirm ? (
              <div>
                <p className="muted" style={{ fontWeight: 600, marginBottom: 10 }}>{t('groups.leaveConfirmTitle', { name: detail.name })} {t('groups.leaveConfirmBody')}</p>
                <div className="acts" style={{ marginTop: 0 }}>
                  <button className="btn danger" onClick={leaveGroup}>{t('groups.leaveConfirmBtn')}</button>
                  <button className="btn ghost" onClick={() => setLeavingConfirm(false)}>{t('groups.leaveCancel')}</button>
                </div>
              </div>
            ) : (
              <button className="btn ghost" onClick={() => setLeavingConfirm(true)}>{t('groups.leaveGroup')}</button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
