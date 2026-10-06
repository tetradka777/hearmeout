'use client';

import { useEffect, useState } from 'react';
import { fmt1 } from '@/lib/numberFormat';
import { useApp } from '@/lib/AppContext';
import { invitePath } from '@/lib/pendingInvite';
import type { Device, GroupDetail, GroupLeaderboardPeriod } from '@/lib/types';
import { userAvatarStyle } from '@/lib/format';
import { toLocale, pluralForKey } from '@/lib/i18n';
import { CoverArt } from '../ui/CoverArt';
import { sinceLabel } from './GroupsScreen';

const AWARD_LABEL_KEY: Record<string, string> = {
  awardMostActive: 'groups.awardMostActive',
  awardNightOwl: 'groups.awardNightOwl',
  awardHarshestCritic: 'groups.awardHarshestCritic',
  awardGenreExplorer: 'groups.awardGenreExplorer',
  awardStreak: 'groups.awardStreak',
};

// Group page (spec 6.6): a real full-screen route reached via viewGroup,
// with its own back crumb — not a locally-selected panel any more.
export function GroupScreen({ device: _device }: { device: Device }) {
  const { t, language, me, state, goBack, showScreen, albums, liveAlbums, openAlbum, showToast, viewFriend } = useApp();
  const [detail, setDetail] = useState<GroupDetail | null>(null);
  const [inviteHandle, setInviteHandle] = useState('');
  const [inviteErr, setInviteErr] = useState('');
  const [period, setPeriod] = useState<GroupLeaderboardPeriod>('month');
  const [leavingConfirm, setLeavingConfirm] = useState(false);

  const groupId = state.viewingGroupId;

  const load = (p: GroupLeaderboardPeriod = period) => {
    if (!groupId) return;
    fetch(`/api/groups/${groupId}?period=${p}`).then((r) => (r.ok ? r.json() : null)).then(setDetail);
  };
  useEffect(() => { setDetail(null); setLeavingConfirm(false); setInviteErr(''); setInviteHandle(''); load('month'); setPeriod('month');   }, [groupId]);

  const changePeriod = (p: GroupLeaderboardPeriod) => { setPeriod(p); load(p); };

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
  const maxLeader = Math.max(1, ...detail.leaderboard.map((r) => r.hours));
  const totalVotes = detail.vote.candidates.reduce((s, x) => s + x.count, 0);
  const voteMonth = new Date(`${detail.vote.monthKey}-01T12:00:00`);
  const voteEnd = new Date(voteMonth.getFullYear(), voteMonth.getMonth() + 1, 0);
  const youTag = (id: string) => (id === me.id ? ` (${t('friend.youLower')})` : '');
  const openMember = (id: string) => { if (id !== me.id) viewFriend(id); };
  const Av = ({ u }: { u: { name: string; avatarUrl: string | null } }) => <span className="dot" style={userAvatarStyle(u)}>{!u.avatarUrl && u.name[0]}</span>;

  return (
    <>
      <button className="crumb" onClick={() => goBack('groups')}>‹ {t('groups.allGroups')}</button>

      <div className="tile t-ink glow">
        <span className="pill">{t('groups.privateGroup')}</span>
        <h1 className="big" style={{ margin: '16px 0 8px' }}>{detail.name}</h1>
        <p className="muted" style={{ fontWeight: 700 }}>{t('groups.memberCount', { count: detail.members.length, word: pluralForKey(language, detail.members.length, 'groups.memberOne', 'groups.memberFew', 'groups.memberMany') })} · {t('groups.since', { date: sinceLabel(detail.createdAt, language) })}</p>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '16px 0' }}>
          {detail.members.map((m) => (
            <button key={m.id} aria-label={m.name} onClick={() => openMember(m.id)}><Av u={m} /></button>
          ))}
        </div>
        <div className="acts" style={{ marginTop: 4 }}>
          <button className="btn" onClick={copyInviteLink}>{t('groups.inviteFriends')}</button>
          <button className="btn ghost" aria-pressed={detail.muted} onClick={toggleMute}>{detail.muted ? t('groups.muted') : t('groups.muteNotifications')}</button>
        </div>
      </div>

      <div className="stats3" style={{ margin: '14px 0' }}>
        <div className="tile t-pop"><span className="num">{Math.round(totalHours)}{t('unit.h')}</span><small>{t(period === 'week' ? 'groups.listenedWeek' : 'groups.listenedMonth')}</small></div>
        <div className="tile t-ac"><span className="num">{totalRatingsThisMonth}</span><small>{t('groups.ratingsThisMonth')}</small></div>
        <div className="tile t-ink"><span className="num">{groupAvgScore ? fmt1(groupAvgScore) : '–'}</span><small>{t('groups.figAvg')}</small></div>
      </div>

      <div className="bento b3">
        <div className="tile s2">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
            <h2 style={{ margin: 0 }}>{t('groups.leaderboard')}</h2>
            <div className="chips" style={{ margin: 0 }} role="group" aria-label={t('recap.periodLabel')}>
              <button className={`chip${period === 'week' ? ' on' : ''}`} onClick={() => changePeriod('week')}>{t('stats.thisWeek')}</button>
              <button className={`chip${period === 'month' ? ' on' : ''}`} onClick={() => changePeriod('month')}>{t('stats.thisMonth')}</button>
            </div>
          </div>
          {detail.leaderboard.map((row, i) => (
            <button className="row" key={row.user.id} onClick={() => openMember(row.user.id)}>
              <span className="num" style={{ fontSize: 26, width: 22 }}>{i + 1}</span>
              <Av u={row.user} />
              <span className="g">
                <b>{row.user.name}{youTag(row.user.id)}</b>
                {i === 0 && row.hours > 0 && <span className="tag" style={{ background: 'var(--acc)', color: 'var(--onacc)' }}>{t('groups.listenedMostTag')}</span>}
              </span>
              <div className="meter" style={{ flex: 'none', width: '30%' }}><i style={{ width: `${Math.round((row.hours / maxLeader) * 100)}%` }} /></div>
              <b style={{ width: 52, textAlign: 'right' }}>{row.hours}{t('unit.h')}</b>
            </button>
          ))}
        </div>

        <div className="tile t-soft2">
          <h2>{t('groups.awards')}</h2>
          {detail.awards.length ? detail.awards.map((a, i) => (
            <div className="row" key={i}>
              {a.winner && <Av u={a.winner} />}
              <span className="g"><b>{t(AWARD_LABEL_KEY[a.label] as never)}</b><small className="muted" style={{ fontWeight: 600 }}>{a.winner?.name} · {a.detail}</small></span>
            </div>
          )) : <p className="muted" style={{ fontWeight: 600 }}>{t('groups.noAwardsYet')}</p>}
          {detail.pastAwards.length > 0 && (
            <>
              <p className="muted" style={{ fontWeight: 800, margin: '14px 0 4px', fontSize: 13 }}>{t('groups.pastMonths')}</p>
              {detail.pastAwards.map((pm) => (
                <div className="row" key={pm.monthKey}>
                  <b style={{ width: 76 }}>{new Date(`${pm.monthKey}-01T12:00:00`).toLocaleDateString(toLocale(language), { month: 'short' })}</b>
                  <span className="g" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {pm.awards.map((a, i) => <span className="tag" key={i}>{t(AWARD_LABEL_KEY[a.label] as never)} · {a.winner?.name}</span>)}
                  </span>
                </div>
              ))}
            </>
          )}
        </div>

        <div className="tile s2">
          <h2>{t('groups.members')}</h2>
          <div className="mgrid">
            {detail.members.map((m) => {
              const s = statsByUser.get(m.id);
              return (
                <button className="mcard" key={m.id} onClick={() => openMember(m.id)}>
                  <div className="top">
                    <Av u={m} />
                    <b>{m.name}{youTag(m.id)}</b>
                    <span className="tag">{m.id === detail.createdBy ? t('groups.owner') : t('groups.member')}</span>
                  </div>
                  <div className="kv"><span className="muted">{t('groups.figHours')}</span><span>{s ? `${s.hoursMonth}${t('unit.h')}` : '–'}</span></div>
                  <div className="kv"><span className="muted">{t('groups.figRatings')}</span><span>{s ? s.ratingsMonth : '–'}</span></div>
                  <div className="kv"><span className="muted">{t('groups.figStreak')}</span><span>{s ? t('groups.daysN', { n: s.streakDays }) : '–'}</span></div>
                  <div className="kv"><span className="muted">{t('groups.figAvg')}</span><span>{s && s.avgScore ? fmt1(s.avgScore) : '–'}</span></div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="tile t-pop">
          <h2>{t('groups.records')}</h2>
          {detail.records.length ? detail.records.map((r, i) => (
            <div className="row" key={i}>
              {r.holder && <Av u={r.holder} />}
              <span className="g"><b>{t(`groups.${r.label}` as never)}</b><small className="muted" style={{ fontWeight: 600 }}>{r.holder?.name ?? '–'}</small></span>
              <b>{r.value}</b>
            </div>
          )) : <p className="muted" style={{ fontWeight: 600 }}>{t('stats.notEnough')}</p>}
        </div>

        <div className="tile t-ink glow s3">
          <span className="pill">{t('groups.voteOpen')}</span>
          <h2 style={{ margin: '14px 0 4px' }}>{t('groups.voteForMonth', { month: voteMonth.toLocaleDateString(toLocale(language), { month: 'long' }) })}</h2>
          <p className="muted" style={{ fontWeight: 600, marginBottom: 16 }}>
            {t('groups.voteQuestion')} {t('groups.voteEnds', { date: voteEnd.toLocaleDateString(toLocale(language), { weekday: 'long' }) })}
          </p>
          {detail.vote.candidates.length ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 12, maxWidth: 640 }}>
              {detail.vote.candidates.map((c) => {
                const a = albumMeta(c.albumId);
                const pct = totalVotes ? Math.round((c.count / totalVotes) * 100) : 0;
                const mine = detail.vote.myVote === c.albumId;
                return (
                  <div key={c.albumId}>
                    <CoverArt url={a?.cover} fallbackLetter={a?.artist[0] || '?'} className="cov" style={{ width: '100%', aspectRatio: '1' }} />
                    <b style={{ display: 'block', margin: '8px 0 2px', fontSize: 14 }}>{a ? a.title : '…'}</b>
                    <div className="meter" style={{ height: 10 }}><i style={{ width: `${pct}%` }} /></div>
                    <small style={{ fontWeight: 700 }}>{t('groups.voteCount', { count: c.count, word: pluralForKey(language, c.count, 'groups.voteOne', 'groups.voteFew', 'groups.voteMany') })} · {pct}%</small>
                    <button className={`btn${mine ? '' : ' ghost'}`} style={{ width: '100%', marginTop: 8, padding: 8 }} onClick={() => castVote(c.albumId)} aria-pressed={mine}>
                      {mine ? t('groups.yourVote') : t('groups.voteBtn')}
                    </button>
                  </div>
                );
              })}
            </div>
          ) : <p className="muted" style={{ fontWeight: 600 }}>{t('groups.noCandidates')}</p>}
        </div>

        <div className="tile s2">
          <h2>{t('groups.topAlbumsTitle')}</h2>
          {detail.topAlbums.length ? detail.topAlbums.map((row) => {
            const a = albumMeta(row.albumId);
            return (
              <button className="row" key={row.albumId} onClick={() => openAlbum(row.albumId)}>
                <CoverArt url={a?.cover} fallbackLetter={a?.artist[0] || '?'} className="cov" style={{ width: 48, height: 48 }} />
                <span className="g"><b>{a ? a.title : '…'}</b><small className="muted" style={{ fontWeight: 600 }}>{a?.artist}{a?.artist ? ' · ' : ''}{t('groups.ratingsN', { n: row.count })}</small></span>
                <span className="num" style={{ fontSize: 28, color: 'var(--acct)' }}>{fmt1(row.avgScore)}</span>
              </button>
            );
          }) : <p className="muted" style={{ fontWeight: 600 }}>{t('stats.notEnough')}</p>}
        </div>

        <div className="tile t-ac">
          <h2 style={{ marginBottom: 8 }}>{t('groups.tasteTitle')}</h2>
          <span className="num" style={{ fontSize: 72 }}>{detail.taste?.avgMatch != null ? `${detail.taste.avgMatch}%` : '–'}</span>
          <p style={{ fontWeight: 800, marginTop: 8 }}>{t('groups.tasteAvg')}</p>
          {detail.taste?.closest && <p style={{ fontWeight: 700, marginTop: 10 }}>{t('groups.tasteClosest', { a: detail.taste.closest.a.name, b: detail.taste.closest.b.name, pct: detail.taste.closest.pct })}</p>}
          {detail.taste?.furthest && <p style={{ fontWeight: 700 }}>{t('groups.tasteFurthest', { a: detail.taste.furthest.a.name, b: detail.taste.furthest.b.name, pct: detail.taste.furthest.pct })}</p>}
        </div>

        <div className="tile s2">
          <h2>{t('groups.inviteByHandle')}</h2>
          <label htmlFor="ginv">{t('groups.handleLabel')}</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input className="field" id="ginv" style={{ flex: 1, minWidth: 150 }} placeholder="@handle" value={inviteHandle} aria-invalid={!!inviteErr} aria-describedby="ginverr" onChange={(e) => setInviteHandle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') invite(); }} />
            <button className="btn" onClick={invite}>{t('groups.invite')}</button>
          </div>
          <p className="ferr" id="ginverr" role="alert">{inviteErr}</p>
        </div>

        <div className="tile">
          <h2>{t('groups.activity')}</h2>
          {detail.activity.length ? detail.activity.map((ev, i) => (
            <button className="row" key={i} onClick={() => openAlbum(ev.albumId)}>
              <span className="dot">•</span>
              <span className="g">{ev.user.name} {ev.type === 'review' ? t('groups.wroteAbout') : t('groups.rated')} {albumMeta(ev.albumId)?.title ?? ev.albumTitle} · {fmt1(ev.stars)}</span>
            </button>
          )) : <p className="muted" style={{ fontWeight: 600 }}>{t('groups.noActivity')}</p>}
        </div>

        <div className="tile t-soft2 s3">
          {leavingConfirm ? (
            <>
              <p className="muted" style={{ fontWeight: 600, marginBottom: 10 }}>{t('groups.leaveConfirmTitle', { name: detail.name })} {t('groups.leaveConfirmBody')}</p>
              <div className="acts" style={{ marginTop: 0 }}>
                <button className="btn danger" onClick={leaveGroup}>{t('groups.leaveConfirmBtn')}</button>
                <button className="btn ghost" onClick={() => setLeavingConfirm(false)}>{t('groups.leaveCancel')}</button>
              </div>
            </>
          ) : (
            <button className="btn ghost" onClick={() => setLeavingConfirm(true)}>{t('groups.leaveGroup')}</button>
          )}
        </div>
      </div>
    </>
  );
}
