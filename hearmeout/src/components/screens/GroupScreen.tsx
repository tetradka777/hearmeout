'use client';

import { useEffect, useState } from 'react';
import { LeaderboardTile } from '../ui/Podium';
import { CoverWall } from '../ui/Visual';
import { fmt1, fmtHours } from '@/lib/numberFormat';
import { useApp } from '@/lib/AppContext';
import { invitePath } from '@/lib/pendingInvite';
import type { Device, GroupDetail, GroupLeaderboardPeriod } from '@/lib/types';
import { userAvatarStyle, formatRelative } from '@/lib/format';
import { toLocale, pluralForKey } from '@/lib/i18n';
import { CoverArt } from '../ui/CoverArt';
import { useCachedJson } from '@/lib/cachedJson';
import { useAlbums } from '@/lib/useAlbum';
import { blurStyle } from '@/lib/imageColor';
import { sinceLabel } from './GroupsScreen';

// Group page (spec 6.6): a real full-screen route reached via viewGroup,
// with its own back crumb — not a locally-selected panel any more.
export function GroupScreen({ device: _device }: { device: Device }) {
  const { t, language, me, state, goBack, showScreen, albums, liveAlbums, spotifyCovers, openAlbum, showToast, viewFriend } = useApp();
  const [inviteHandle, setInviteHandle] = useState('');
  const [inviteErr, setInviteErr] = useState('');
  const [period, setPeriod] = useState<GroupLeaderboardPeriod>('month');
  const [leavingConfirm, setLeavingConfirm] = useState(false);

  const groupId = state.viewingGroupId;

  // Shared cache (lib/cachedJson): a group the preloader already fetched
  // opens at once; after a change here the answer is fetched again.
  const groupQuery = useCachedJson<GroupDetail>(groupId ? `/api/groups/${groupId}?period=${period}` : null);
  const detail = groupQuery.data;
  // Every album on the page fetched together (covers, titles): the collage,
  // the vote, the wall and the latest ratings.
  useAlbums(detail ? [...new Set([
    ...detail.topAlbums.map((r) => r.albumId),
    ...detail.vote.candidates.map((c) => c.albumId),
    ...detail.activity.slice(0, 6).map((e) => e.albumId),
  ])] : []);
  const load = () => { groupQuery.reload(); };
  useEffect(() => { setLeavingConfirm(false); setInviteErr(''); setInviteHandle(''); setPeriod('month'); }, [groupId]);

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
  const statsByUser = new Map(detail.memberStats.map((s) => [s.userId, s]));
  const albumMeta = (id: string) => liveAlbums[id] || albums.find((x) => x.id === id);
  const totalVotes = detail.vote.candidates.reduce((s, x) => s + x.count, 0);
  const voteMonth = new Date(`${detail.vote.monthKey}-01T12:00:00`);
  const voteEnd = new Date(voteMonth.getFullYear(), voteMonth.getMonth() + 1, 0);
  const openMember = (id: string) => { if (id !== me.id) viewFriend(id); };
  const Av = ({ u }: { u: { name: string; avatarUrl: string | null } }) => <span className="dot" style={userAvatarStyle(u)}>{!u.avatarUrl && u.name[0]}</span>;

  const statOf = (id: string) => statsByUser.get(id);
  // Up to six (four on a phone) of the month's most rated albums as the hero collage.
  const heroCovers = detail.topAlbums.slice(0, 6);
  const maxHours = Math.max(0, ...detail.leaderboard.map((r) => r.hours));
  // The page's top card over its best album's cover, blurred.
  const heroAlbum = heroCovers[0] ? albumMeta(heroCovers[0].albumId) : undefined;
  const heroCover = heroAlbum ? spotifyCovers[heroAlbum.id] || heroAlbum.cover : null;
  const coverOf = (id: string | undefined, fallback?: string | null) => {
    const a = id ? albumMeta(id) : undefined;
    return (a ? spotifyCovers[a.id] || a.cover : null) || fallback || null;
  };
  const leadCandidate = [...detail.vote.candidates].sort((x, y) => y.count - x.count)[0];
  const leadCover = coverOf(leadCandidate?.albumId);

  return (
    <>
      <button className="crumb" onClick={() => goBack('groups')}>‹ {t('groups.allGroups')}</button>

      {/* Variant A, "club magazine": the cover, then what the group decides
          this month (the vote), then who listened, the club's wall, the
          latest ratings, and the members with invite / mute / leave last. */}
      <div className="gp21">
        <div className={`tile gh21 ${heroCover ? 'bh15' : 't-ink glow'}`} style={blurStyle(heroCover)}>
          {heroCovers.length > 0 && (
            <div className="col" aria-hidden="true">
              {heroCovers.map((row) => {
                const a = albumMeta(row.albumId);
                return <CoverArt key={row.albumId} url={coverOf(row.albumId) ?? undefined} fallbackLetter={a?.artist[0] || '?'} className="cov" px={180} />;
              })}
            </div>
          )}
          <div className="bd">
            <span className="pill">{t('groups.privateGroup')}</span>
            <h1 className="big">{detail.name}</h1>
            <p className="muted">{t('groups.memberCount', { count: detail.members.length, word: pluralForKey(language, detail.members.length, 'groups.memberOne', 'groups.memberFew', 'groups.memberMany') })} · {t('groups.since', { date: sinceLabel(detail.createdAt, language) })}</p>
            <div className="st15 gst19">
              <div><b>{Math.round(totalHours)}<small className="u">{t('unit.h')}</small></b><small>{t(period === 'week' ? 'groups.listenedWeek' : 'groups.listenedMonth')}</small></div>
              <div><b>{totalRatingsThisMonth}</b><small>{t('groups.ratingsThisMonth')}</small></div>
              <div><b>{groupAvgScore ? `★ ${fmt1(groupAvgScore)}` : '–'}</b><small>{t('groups.figAvg')}</small></div>
            </div>
          </div>
        </div>

        {/* The vote, right under the cover: the one thing here that asks
            for something. Over the blurred cover of the album that leads. */}
        <div className={`tile ${leadCover ? 'bh15' : 't-ink glow'}`} style={blurStyle(leadCover)}>
          <span className="pill">{t('groups.voteOpen')}</span>
          <h2 style={{ margin: '14px 0 4px' }}>{t('groups.voteForMonth', { month: voteMonth.toLocaleDateString(toLocale(language), { month: 'long' }) })}</h2>
          <p className="muted" style={{ fontWeight: 600, marginBottom: 16 }}>
            {t('groups.voteQuestion')} {t('groups.voteEnds', { date: voteEnd.toLocaleDateString(toLocale(language), { day: 'numeric', month: 'long' }) })}
          </p>
          {detail.vote.candidates.length ? (
            <div className="vt20">
              {detail.vote.candidates.map((c) => {
                const a = albumMeta(c.albumId);
                const pct = totalVotes ? Math.round((c.count / totalVotes) * 100) : 0;
                const mine = detail.vote.myVote === c.albumId;
                const lead = c.count > 0 && c.albumId === leadCandidate?.albumId;
                return (
                  <div key={c.albumId} className={`vr${mine ? ' mine' : ''}`}>
                    <button className="cvb" onClick={() => openAlbum(c.albumId)} aria-label={a?.title ?? c.albumId}>
                      <CoverArt url={a?.cover} fallbackLetter={a?.artist[0] || '?'} className="cov" px={64} />
                    </button>
                    <div className="g">
                      <b>{a ? a.title : '…'}</b>
                      {a && <small className="ar20">{a.artist}</small>}
                      <span className="bar"><i style={{ width: `${pct}%` }} /></span>
                      <small className="c">
                        {lead && <><i className="ic ic-medal" aria-hidden="true" /> </>}
                        {t('groups.voteCount', { count: c.count, word: pluralForKey(language, c.count, 'groups.voteOne', 'groups.voteFew', 'groups.voteMany') })} · {pct}%
                      </small>
                    </div>
                    <button className={`vb${mine ? ' on' : ''}`} onClick={() => castVote(c.albumId)} aria-pressed={mine}>
                      {mine ? t('groups.yourVote') : t('groups.voteBtn')}
                    </button>
                  </div>
                );
              })}
            </div>
          ) : <p className="muted" style={{ fontWeight: 600 }}>{t('groups.noCandidates')}</p>}
        </div>

        <div className="bento b3 gb21">
          {/* Who listened most: everyone as a row with a bar of their hours,
              in the colours of the top three. */}
          <LeaderboardTile className="s2" people={detail.leaderboard.slice(0, 3).map((r) => r.user)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0 }}>{t('groups.leaderboard')}</h2>
              <div className="chips" style={{ margin: 0 }} role="group" aria-label={t('recap.periodLabel')}>
                <button className={`chip${period === 'week' ? ' on' : ''}`} onClick={() => changePeriod('week')}>{t('stats.thisWeek')}</button>
                <button className={`chip${period === 'month' ? ' on' : ''}`} onClick={() => changePeriod('month')}>{t('stats.thisMonth')}</button>
              </div>
            </div>
            <div className="lr21">
              {detail.leaderboard.map((row, i) => {
                const s = statOf(row.user.id);
                const pct = maxHours ? Math.max(4, Math.round((row.hours / maxHours) * 100)) : 0;
                return (
                  <button key={row.user.id} className={`r${row.user.id === me.id ? ' you' : ''}`} onClick={() => openMember(row.user.id)}>
                    <span className="n">{i + 1}</span>
                    <Av u={row.user} />
                    <span className="g">
                      <b>
                        {row.user.name}
                        {row.user.id === detail.createdBy && <small> · {t('groups.owner')}</small>}
                        {s && s.streakDays > 0 && <small className="fl"> <i className="ic ic-flame" aria-hidden="true" /> {s.streakDays}</small>}
                      </b>
                      <span className="bar"><i style={{ width: `${pct}%` }} /></span>
                    </span>
                    <span className="h">{fmtHours(row.hours)}{t('unit.h')}</span>
                  </button>
                );
              })}
            </div>
          </LeaderboardTile>

          {/* The latest ratings as a short list. */}
          <div className="tile af21">
            <h2>{t('groups.activity')}</h2>
            {detail.activity.length ? (
              <div className="ls">
                {detail.activity.slice(0, 6).map((ev, i) => {
                  const a = albumMeta(ev.albumId);
                  return (
                    <button className="r" key={i} onClick={() => openAlbum(ev.albumId)}>
                      <span className="cvw">
                        <CoverArt url={a?.cover ?? ev.cover ?? undefined} fallbackLetter={(a?.artist ?? ev.albumArtist)[0] || '?'} className="cov" px={48} />
                        <Av u={ev.user} />
                      </span>
                      <span className="g">
                        <b>{a?.title ?? ev.albumTitle}</b>
                        <small>{ev.user.name} {ev.type === 'review' ? t('groups.wroteAbout') : t('groups.rated')} · {formatRelative(ev.createdAt, language)}</small>
                      </span>
                      <span className="scr">★ {fmt1(ev.stars)}</span>
                    </button>
                  );
                })}
              </div>
            ) : <p className="muted" style={{ fontWeight: 600 }}>{t('groups.noActivity')}</p>}
          </div>

          {/* The club's wall: this month's most rated albums, covers with
              the group's average. */}
          {detail.topAlbums.length > 0 && (
            <div className="tile s3 wl21">
              <h2>{t('groups.heroTopAlbums')}</h2>
              <CoverWall row items={detail.topAlbums.map((row) => {
                const a = albumMeta(row.albumId);
                return { key: row.albumId, cover: coverOf(row.albumId), title: a?.title ?? '…', artist: a?.artist ?? null, artistId: a?.artistId ?? null, badge: fmt1(row.avgScore), onClick: () => openAlbum(row.albumId) };
              })} />
            </div>
          )}

          {/* Members, then inviting, muting and leaving. */}
          <div className="tile t-soft2 s3 mb21">
            <h2>{t('groups.members')}</h2>
            <div className="ms">
              {detail.members.map((m) => (
                <button key={m.id} onClick={() => openMember(m.id)}>
                  <Av u={m} />
                  <b>{m.name}</b>
                  {m.id === detail.createdBy && <small>{t('groups.owner')}</small>}
                </button>
              ))}
            </div>
            <div className="acts" style={{ margin: '14px 0 18px' }}>
              <button className="btn" onClick={copyInviteLink}>{t('groups.inviteFriends')}</button>
              <button className="btn ghost" aria-pressed={detail.muted} onClick={toggleMute}>{detail.muted ? t('groups.muted') : t('groups.muteNotifications')}</button>
            </div>
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
      </div>
    </>
  );
}
