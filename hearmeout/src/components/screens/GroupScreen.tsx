'use client';

import { useEffect, useState } from 'react';
import { fmt1, fmtHours } from '@/lib/numberFormat';
import { useApp } from '@/lib/AppContext';
import { invitePath } from '@/lib/pendingInvite';
import type { Device, GroupDetail, GroupLeaderboardPeriod } from '@/lib/types';
import { userAvatarStyle, formatRelative } from '@/lib/format';
import { toLocale, pluralForKey } from '@/lib/i18n';
import { CoverArt } from '../ui/CoverArt';
import { useCachedJson } from '@/lib/cachedJson';
import { sinceLabel } from './GroupsScreen';

const AWARD_LABEL_KEY: Record<string, string> = {
  awardMostActive: 'groups.awardMostActive',
  awardNightOwl: 'groups.awardNightOwl',
  awardHarshestCritic: 'groups.awardHarshestCritic',
  awardGenreExplorer: 'groups.awardGenreExplorer',
  awardStreak: 'groups.awardStreak',
  awardScout: 'groups.awardScout',
  awardStuck: 'groups.awardStuck',
  awardTimeTraveler: 'groups.awardTimeTraveler',
};

// Glyphs for the award and record cards (rev 9b; monochrome SVG masks, no emoji).
const AWARD_ICON: Record<string, string> = {
  awardMostActive: 'bolt', awardNightOwl: 'moon', awardHarshestCritic: 'lens', awardGenreExplorer: 'compass',
  awardStreak: 'flame', awardScout: 'medal', awardStuck: 'repeat', awardTimeTraveler: 'clock',
};
const RECORD_ICON: Record<string, string> = {
  recordLongestStreak: 'flame', recordMostRatings: 'star', recordHighestAverage: 'heart',
  recordMostFinished: 'flag', recordLatestListener: 'moon', recordHotTake: 'spark',
};

// Group page (spec 6.6): a real full-screen route reached via viewGroup,
// with its own back crumb — not a locally-selected panel any more.
export function GroupScreen({ device: _device }: { device: Device }) {
  const { t, language, me, state, goBack, showScreen, albums, liveAlbums, openAlbum, showToast, viewFriend } = useApp();
  const [inviteHandle, setInviteHandle] = useState('');
  const [inviteErr, setInviteErr] = useState('');
  const [period, setPeriod] = useState<GroupLeaderboardPeriod>('month');
  const [leavingConfirm, setLeavingConfirm] = useState(false);

  const groupId = state.viewingGroupId;

  // Shared cache (lib/cachedJson): a group the preloader already fetched
  // opens at once; after a change here the answer is fetched again.
  const groupQuery = useCachedJson<GroupDetail>(groupId ? `/api/groups/${groupId}?period=${period}` : null);
  const detail = groupQuery.data;
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
  // Award details come from the server as plain numbers ("73.6h", "4d",
  // "3.6", "9"): shown here with the interface's decimal comma and words.
  const awardDetail = (label: string, detail: string): string => {
    const n = parseFloat(detail);
    switch (label) {
      case 'awardScout': return t('groups.awardScoutDetail', { n });
      case 'awardTimeTraveler': return t('groups.awardTimeTravelerDetail', { year: detail });
      case 'awardMostActive': return `${fmtHours(n)}${t('unit.h')}`;
      case 'awardHarshestCritic': return fmt1(n);
      case 'awardStreak': return t('groups.daysN', { n });
      case 'awardGenreExplorer': return t('groups.genresN', { n });
      default: return detail;
    }
  };
  // Record values come as plain strings ("4d", "4.1", a timestamp, "±1.5").
  const recordValue = (label: string, value: string): string => {
    if (label === 'recordLongestStreak') return t('groups.daysN', { n: parseInt(value, 10) || 0 });
    if (label === 'recordHighestAverage') return fmt1(parseFloat(value));
    if (label === 'recordHotTake') return `±${fmt1(parseFloat(value.replace('±', '')))}`;
    if (label === 'recordLatestListener') {
      const d = new Date(value);
      return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString(toLocale(language), { day: 'numeric', month: 'short' });
    }
    return value;
  };
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

  const memberOrder = detail.members;
  const statOf = (id: string) => statsByUser.get(id);
  const bars = (vals: number[], inv?: boolean) => {
    const mx = Math.max(1, ...vals);
    return <span className={`b9${inv ? ' inv' : ''}`} aria-hidden="true">{vals.map((v, i) => <i key={i} style={{ height: `${Math.round((v / mx) * 100)}%` }} />)}</span>;
  };
  const pairPct = new Map((detail.taste?.pairs || []).flatMap((p) => [[`${p.a}|${p.b}`, p.pct], [`${p.b}|${p.a}`, p.pct]] as [string, number][]));
  const heroCovers = detail.topAlbums.slice(0, 3);

  return (
    <>
      <button className="crumb" onClick={() => goBack('groups')}>‹ {t('groups.allGroups')}</button>

      {/* Hero (rev 9b): the group on the left, the club's top albums tilted on the right. */}
      <div className="tile t-ink glow ghero9">
        <div className="gh-l">
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
        {heroCovers.length > 0 && (
          <div className="gh-r" aria-hidden="true">
            <div className="hcs9">
              {heroCovers.map((row, i) => {
                const a = albumMeta(row.albumId);
                return <span key={row.albumId} className={`hc${i + 1}`}><CoverArt url={a?.cover} fallbackLetter={a?.artist[0] || '?'} className="cov" px={110} style={{ width: '100%', aspectRatio: '1' }} /></span>;
              })}
            </div>
            <small>{t('groups.heroTopAlbums')}</small>
          </div>
        )}
      </div>

      {/* Three figures, each with the members' values as small bars. */}
      <div className="stats3" style={{ margin: '14px 0' }}>
        <div className="tile t-pop"><span className="num">{Math.round(totalHours)}{t('unit.h')}</span><small>{t(period === 'week' ? 'groups.listenedWeek' : 'groups.listenedMonth')}</small>{bars(detail.leaderboard.map((r) => r.hours))}</div>
        <div className="tile t-ac"><span className="num">{totalRatingsThisMonth}</span><small>{t('groups.ratingsThisMonth')}</small>{bars(memberOrder.map((m) => statOf(m.id)?.ratingsMonth ?? 0), true)}</div>
        <div className="tile t-ink"><span className="num">{groupAvgScore ? fmt1(groupAvgScore) : '–'}</span><small>{t('groups.figAvg')}</small>{bars(memberOrder.map((m) => statOf(m.id)?.avgScore ?? 0), true)}</div>
      </div>

      <div className="bento b3">
        <div className="tile s3">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
            <h2 style={{ margin: 0 }}>{t('groups.leaderboard')}</h2>
            <div className="chips" style={{ margin: 0 }} role="group" aria-label={t('recap.periodLabel')}>
              <button className={`chip${period === 'week' ? ' on' : ''}`} onClick={() => changePeriod('week')}>{t('stats.thisWeek')}</button>
              <button className={`chip${period === 'month' ? ' on' : ''}`} onClick={() => changePeriod('month')}>{t('stats.thisMonth')}</button>
            </div>
          </div>
          {detail.leaderboard.map((row, i) => (
            <button className="row" key={row.user.id} onClick={() => openMember(row.user.id)}>
              <span className={`md9${i < 3 ? ` g${i + 1}` : ''}`}>{i + 1}</span>
              <Av u={row.user} />
              {/* On a phone the bar gives way, not the name. */}
              <span className="g" style={{ minWidth: 84 }}>
                <b>{row.user.name}{youTag(row.user.id)}</b>
                {i === 0 && row.hours > 0 && <span className="tag" style={{ background: 'var(--acc)', color: 'var(--onacc)' }}>{t('groups.listenedMostTag')}</span>}
              </span>
              <div className="meter" style={{ flex: '0 1 30%', minWidth: 32 }}><i style={{ width: `${Math.round((row.hours / maxLeader) * 100)}%` }} /></div>
              <b style={{ width: 52, textAlign: 'right' }}>{fmtHours(row.hours)}{t('unit.h')}</b>
            </button>
          ))}
        </div>

        {/* Awards as cards: glyph, award, winner, value (full width: eight of them). */}
        <div className="tile t-soft2 s3">
          <h2>{t('groups.awards')}</h2>
          {detail.awards.length ? (
            <div className="awg9" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))' }}>
              {detail.awards.map((a, i) => (
                <div className="aw9" key={i}>
                  <span className="gl9" aria-hidden="true"><i className={`ic-${AWARD_ICON[a.label] ?? 'star'}`} /></span>
                  <b>{t(AWARD_LABEL_KEY[a.label] as never)}</b>
                  {a.winner && <span className="who9"><Av u={a.winner} />{a.winner.name}</span>}
                  <small>{awardDetail(a.label, a.detail)}</small>
                </div>
              ))}
            </div>
          ) : <p className="muted" style={{ fontWeight: 600 }}>{t('groups.noAwardsYet')}</p>}
          {detail.pastAwards.length > 0 && (
            <>
              <p className="muted" style={{ fontWeight: 800, margin: '14px 0 4px', fontSize: 13 }}>{t('groups.pastMonths')}</p>
              {detail.pastAwards.map((pm) => (
                <div className="row" key={pm.monthKey}>
                  <b style={{ width: 56 }}>{new Date(`${pm.monthKey}-01T12:00:00`).toLocaleDateString(toLocale(language), { month: 'short' })}</b>
                  <span className="g" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {pm.awards.map((a, i) => <span className="chip" key={i}>{a.winner && <Av u={a.winner} />}{t(AWARD_LABEL_KEY[a.label] as never)}</span>)}
                  </span>
                </div>
              ))}
            </>
          )}
        </div>

        <div className="tile t-ink glow s3">
          <span className="pill">{t('groups.voteOpen')}</span>
          <h2 style={{ margin: '14px 0 4px' }}>{t('groups.voteForMonth', { month: voteMonth.toLocaleDateString(toLocale(language), { month: 'long' }) })}</h2>
          <p className="muted" style={{ fontWeight: 600, marginBottom: 16 }}>
            {t('groups.voteQuestion')} {t('groups.voteEnds', { date: voteEnd.toLocaleDateString(toLocale(language), { day: 'numeric', month: 'long' }) })}
          </p>
          {detail.vote.candidates.length ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 12, maxWidth: 640 }}>
              {detail.vote.candidates.map((c) => {
                const a = albumMeta(c.albumId);
                const pct = totalVotes ? Math.round((c.count / totalVotes) * 100) : 0;
                const mine = detail.vote.myVote === c.albumId;
                return (
                  <div key={c.albumId}>
                    <CoverArt url={a?.cover} fallbackLetter={a?.artist[0] || '?'} className="cov" px={170} style={{ width: '100%', aspectRatio: '1' }} />
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

        {/* Top albums as a shelf of covers with the group score; the best in gold. */}
        <div className="tile s3">
          <h2>{t('groups.topAlbumsTitle')}</h2>
          {detail.topAlbums.length ? (
            <div className="tag9">
              {detail.topAlbums.map((row, i) => {
                const a = albumMeta(row.albumId);
                return (
                  <button className={`ta9${i === 0 ? ' first' : ''}`} key={row.albumId} onClick={() => openAlbum(row.albumId)}>
                    <CoverArt url={a?.cover} fallbackLetter={a?.artist[0] || '?'} className="cov" px={220} style={{ width: '100%', aspectRatio: '1' }} />
                    <span className="sc9">{fmt1(row.avgScore)}</span>
                    <b>{a ? a.title : '…'}</b>
                    <small className="muted" style={{ fontWeight: 600 }}>{a?.artist}{a?.artist ? ' · ' : ''}{t('groups.ratingsN', { n: row.count })}</small>
                  </button>
                );
              })}
            </div>
          ) : <p className="muted" style={{ fontWeight: 600 }}>{t('stats.notEnough')}</p>}
        </div>

        {/* Group taste: every pair's match as a heat matrix, the closest and furthest pair. */}
        <div className="tile s3">
          <div style={{ marginBottom: 10, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div><h2 style={{ margin: 0 }}>{t('groups.tasteTitle')}</h2><p className="muted" style={{ fontWeight: 600 }}>{t('groups.tasteDesc')}</p></div>
            <div style={{ textAlign: 'right' }}>
              <span className="num" style={{ fontSize: 54, lineHeight: 1, color: 'var(--acct)' }}>{detail.taste?.avgMatch != null ? `${detail.taste.avgMatch}%` : '–'}</span><br />
              <small style={{ fontWeight: 800 }}>{t('groups.tasteAvg')}</small>
            </div>
          </div>
          <div className="tm9">
            <div className="mx9" style={{ gridTemplateColumns: `auto repeat(${memberOrder.length},minmax(0,1fr))` }} role="img" aria-label={t('groups.tasteDesc')}>
              <span />
              {memberOrder.map((m) => <span className="mh9" key={`h${m.id}`}><Av u={m} /></span>)}
              {memberOrder.map((a) => [
                <span className="mh9" key={`r${a.id}`}><Av u={a} /></span>,
                ...memberOrder.map((b) => {
                  if (a.id === b.id) return <span className="mc9 self" key={`${a.id}${b.id}`} />;
                  const v = pairPct.get(`${a.id}|${b.id}`);
                  return v == null
                    ? <span className="mc9 self" key={`${a.id}${b.id}`} />
                    : <span className="mc9" key={`${a.id}${b.id}`} style={{ ['--v' as string]: v }} title={`${a.name} · ${b.name}: ${v}%`}>{v}</span>;
                }),
              ])}
            </div>
            <div className="pairs9">
              {detail.taste?.closest && (
                <div className="pr9"><small className="k9 muted">{t('groups.tasteClosestLabel')}</small>
                  <div className="pp9"><Av u={detail.taste.closest.a} /><Av u={detail.taste.closest.b} /><b>{t('groups.pairNames', { a: detail.taste.closest.a.name, b: detail.taste.closest.b.name })}</b><span className="num">{detail.taste.closest.pct}%</span></div>
                </div>
              )}
              {detail.taste?.furthest && (
                <div className="pr9"><small className="k9 muted">{t('groups.tasteFurthestLabel')}</small>
                  <div className="pp9"><Av u={detail.taste.furthest.a} /><Av u={detail.taste.furthest.b} /><b>{t('groups.pairNames', { a: detail.taste.furthest.a.name, b: detail.taste.furthest.b.name })}</b><span className="num">{detail.taste.furthest.pct}%</span></div>
                </div>
              )}
            </div>
          </div>
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
                  <div className="kv"><span className="muted">{t('groups.figHours')}</span><span>{s ? `${fmtHours(s.hoursMonth)}${t('unit.h')}` : '–'}</span></div>
                  <div className="kv"><span className="muted">{t('groups.figRatings')}</span><span>{s ? s.ratingsMonth : '–'}</span></div>
                  <div className="kv"><span className="muted">{t('groups.figAvg')}</span><span>{s && s.avgScore ? fmt1(s.avgScore) : '–'}</span></div>
                  {s && s.streakDays > 0 && <div className="stk9x"><span className="fl9"><i className="ic-flame" /> {t('groups.streakChip', { n: s.streakDays })}</span></div>}
                </button>
              );
            })}
          </div>
        </div>

        <div className="tile t-pop">
          <h2>{t('groups.records')}</h2>
          {detail.records.length ? detail.records.map((r, i) => (
            <div className="row" key={i}>
              <span className="gl9 sm" aria-hidden="true"><i className={`ic-${RECORD_ICON[r.label] ?? 'star'}`} /></span>
              <span className="g"><b>{t(`groups.${r.label}` as never)}</b><small className="muted" style={{ fontWeight: 600 }}>{r.holder?.name ?? '–'}</small></span>
              <b>{recordValue(r.label, r.value)}</b>
            </div>
          )) : <p className="muted" style={{ fontWeight: 600 }}>{t('stats.notEnough')}</p>}
        </div>

        <div className="tile s2">
          <h2>{t('groups.inviteByHandle')}</h2>
          <label htmlFor="ginv">{t('groups.handleLabel')}</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input className="field" id="ginv" style={{ flex: 1, minWidth: 150 }} placeholder={t('friends.handlePlaceholder')} value={inviteHandle} aria-invalid={!!inviteErr} aria-describedby="ginverr" onChange={(e) => setInviteHandle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') invite(); }} />
            <button className="btn" onClick={invite}>{t('groups.invite')}</button>
          </div>
          <p className="ferr" id="ginverr" role="alert">{inviteErr}</p>
        </div>

        <div className="tile">
          <h2>{t('groups.activity')}</h2>
          {detail.activity.length ? detail.activity.map((ev, i) => {
            const a = albumMeta(ev.albumId);
            return (
              <button className="row" key={i} onClick={() => openAlbum(ev.albumId)}>
                <Av u={ev.user} />
                <span className="g">{ev.user.name} {ev.type === 'review' ? t('groups.wroteAbout') : t('groups.rated')} {a?.title ?? ev.albumTitle} · {fmt1(ev.stars)}<small className="muted" style={{ fontWeight: 700, display: 'block' }}>{formatRelative(ev.createdAt, language)}</small></span>
                <span className="acv9"><CoverArt url={a?.cover ?? ev.cover ?? undefined} fallbackLetter={(a?.artist ?? ev.albumArtist)[0] || '?'} className="cov" style={{ width: 40, height: 40 }} /></span>
              </button>
            );
          }) : <p className="muted" style={{ fontWeight: 600 }}>{t('groups.noActivity')}</p>}
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
