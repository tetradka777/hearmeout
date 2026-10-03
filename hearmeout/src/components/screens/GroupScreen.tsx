'use client';

import { useEffect, useState } from 'react';
import { useApp } from '@/lib/AppContext';
import type { Device, GroupDetail, GroupLeaderboardPeriod } from '@/lib/types';
import { userAvatarStyle, starsText } from '@/lib/format';
import { toLocale } from '@/lib/i18n';
import { CoverArt } from '../ui/CoverArt';
import { accentMix } from '@/lib/accentGradient';

const AWARD_LABEL_KEY: Record<string, string> = {
  awardMostActive: 'groups.awardMostActive',
  awardNightOwl: 'groups.awardNightOwl',
  awardHarshestCritic: 'groups.awardHarshestCritic',
  awardGenreExplorer: 'groups.awardGenreExplorer',
  awardStreak: 'groups.awardStreak',
};

// Group page (spec 6.6): a real full-screen route reached via viewGroup,
// with its own back crumb — not a locally-selected panel any more.
export function GroupScreen({ device }: { device: Device }) {
  const { t, language, me, state, goBack, showScreen, albums, liveAlbums, openAlbum, showToast, viewFriend } = useApp();
  const [detail, setDetail] = useState<GroupDetail | null>(null);
  const [inviteHandle, setInviteHandle] = useState('');
  const [period, setPeriod] = useState<GroupLeaderboardPeriod>('month');
  const [leavingConfirm, setLeavingConfirm] = useState(false);

  const groupId = state.viewingGroupId;

  const load = (p: GroupLeaderboardPeriod = period) => {
    if (!groupId) return;
    fetch(`/api/groups/${groupId}?period=${p}`).then((r) => (r.ok ? r.json() : null)).then(setDetail);
  };
  useEffect(() => { setDetail(null); setLeavingConfirm(false); load('month'); setPeriod('month'); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [groupId]);

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

  const invite = async () => {
    if (!inviteHandle.trim()) return;
    const res = await fetch(`/api/groups/${groupId}/members`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ handle: inviteHandle.trim() }) });
    if (res.ok) { setInviteHandle(''); load(); showToast(t('groups.inviteSuccess')); }
    else {
      const body = await res.json().catch(() => null);
      showToast(body?.error === 'not_found' ? t('groups.inviteNotFound') : body?.error === 'already_member' ? t('groups.alreadyMember') : t('groups.inviteFailed'));
    }
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
  const voteTop = Math.max(1, ...detail.vote.candidates.map((c) => c.count));
  const albumMeta = (id: string) => liveAlbums[id] || albums.find((x) => x.id === id);
  const recordValue = (r: GroupDetail['records'][number]) =>
    r.holder ? `${r.holder.name} — ${r.value}` : '—';

  return (
    <>
      <button className="crumb" onClick={() => goBack('groups')}>‹ {t('groups.allGroups')}</button>

      <div className="tile t-ink hero glow">
        <span className="pill">{t('groups.privateGroup')}</span>
        <h1>{detail.name}</h1>
        <p className="muted">{t('groups.memberCount', { count: detail.members.length })} · {t('groups.since', { date: new Date(detail.createdAt).toLocaleDateString() })}</p>
        <div className="hrow" style={{ marginTop: 10 }}>
          {detail.members.map((m) => (
            <button key={m.id} className="dot" style={{ ...userAvatarStyle(m), width: 40, height: 40 }} onClick={() => m.id !== me.id && viewFriend(m.id)}>
              {m.name[0]}
            </button>
          ))}
        </div>
        <div className="acts">
          <button className="btn" onClick={async () => { await navigator.clipboard.writeText(window.location.origin); showToast(t('groups.inviteSuccess')); }}>{t('groups.invite')}</button>
          <button className="btn ghost" aria-pressed={detail.muted} onClick={toggleMute}>{detail.muted ? t('groups.muted') : t('groups.muteNotifications')}</button>
        </div>
      </div>

      <div className="stats3">
        <div className="tile t-pop"><span className="num">{totalHours.toFixed(0)}h</span><small>{t(period === 'week' ? 'groups.listenedWeek' : 'groups.listenedMonth')}</small></div>
        <div className="tile t-ac"><span className="num">{totalRatingsThisMonth}</span><small>{t('groups.figRatings')}</small></div>
        <div className="tile t-ink"><span className="num">{groupAvgScore ? groupAvgScore.toFixed(1) : '—'}</span><small>{t('groups.figAvg')}</small></div>
      </div>

      <div className="bento b3">
        <div className="tile s2">
          <div className="setrow" style={{ border: 0, padding: 0, marginBottom: 10 }}>
            <h3 style={{ marginBottom: 0 }}>{t('groups.leaderboard')}</h3>
            <div className="chips" style={{ marginBottom: 0 }}>
              <button className={`chip ${period === 'week' ? 'on' : ''}`} onClick={() => changePeriod('week')}>{t('stats.thisWeek')}</button>
              <button className={`chip ${period === 'month' ? 'on' : ''}`} onClick={() => changePeriod('month')}>{t('stats.thisMonth')}</button>
            </div>
          </div>
          <div className="stack">
            {detail.leaderboard.map((row, i) => (
              <button className="row" key={row.user.id} onClick={() => row.user.id !== me.id && viewFriend(row.user.id)} style={{ cursor: 'pointer' }}>
                <span className="muted" style={{ width: 20 }}>{i + 1}</span>
                <div className="dot" style={userAvatarStyle(row.user)}>{row.user.name[0]}</div>
                <div className="g">
                  <b>{row.user.name}{row.user.id === me.id ? ` (${t('friend.you')})` : ''}</b>
                  <div className="meter" style={{ marginTop: 4 }}><i style={{ width: `${totalHours ? (row.hours / totalHours) * 100 : 0}%` }} /></div>
                </div>
                {i === 0 && row.hours > 0 && <span className="tag">{t('groups.listenedMostTag')}</span>}
                <small className="muted">{row.hours}h</small>
              </button>
            ))}
          </div>
        </div>

        {(detail.awards.length > 0 || detail.pastAwards.length > 0) && (
          <div className="tile t-soft2">
            <h3>{t('groups.awards')}</h3>
            <div className="stack" style={{ marginTop: 10 }}>
              {detail.awards.map((a, i) => (
                <div className="row" key={i}>
                  <div className="g"><b>{t(AWARD_LABEL_KEY[a.label] as never)}</b><div className="muted">{a.winner?.name} — {a.detail}</div></div>
                </div>
              ))}
            </div>
            {detail.pastAwards.length > 0 && (
              <>
                <p className="muted" style={{ fontWeight: 800, margin: '14px 0 4px', fontSize: 13 }}>{t('groups.pastMonths')}</p>
                <div className="stack" style={{ gap: 6 }}>
                  {detail.pastAwards.map((pm) => (
                    <div className="row" key={pm.monthKey} style={{ alignItems: 'flex-start' }}>
                      <div className="g">
                        <b style={{ fontSize: 13 }}>{new Date(`${pm.monthKey}-01`).toLocaleDateString(toLocale(language), { month: 'long', year: 'numeric' })}</b>
                        <div className="hrow" style={{ marginTop: 4, flexWrap: 'wrap', gap: 6 }}>
                          {pm.awards.map((a, i) => (
                            <span className="tag" key={i}>{t(AWARD_LABEL_KEY[a.label] as never)}: {a.winner?.name}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        <div className="tile s2">
          <h3>{t('groups.members')}</h3>
          <div className="mgrid" style={{ marginTop: 10 }}>
            {detail.members.map((m) => {
              const s = statsByUser.get(m.id);
              return (
                <button className="mcard" key={m.id} onClick={() => m.id !== me.id && viewFriend(m.id)}>
                  <div className="top">
                    <div className="dot" style={userAvatarStyle(m)}>{m.name[0]}</div>
                    <b>{m.name}</b>
                    <span className="tag">{m.id === detail.createdBy ? t('groups.owner') : t('groups.member')}</span>
                  </div>
                  {s && (
                    <>
                      <div className="kv"><span className="muted">{t('groups.figHours')}</span><span>{s.hoursMonth}h</span></div>
                      <div className="kv"><span className="muted">{t('groups.figRatings')}</span><span>{s.ratingsMonth}</span></div>
                      <div className="kv"><span className="muted">{t('groups.figStreak')}</span><span>{s.streakDays}</span></div>
                      <div className="kv"><span className="muted">{t('groups.figAvg')}</span><span>{s.avgScore || '—'}</span></div>
                    </>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="tile t-pop">
          <h3>{t('groups.records')}</h3>
          <div className="stack" style={{ marginTop: 10 }}>
            {detail.records.length ? detail.records.map((r, i) => (
              <div className="row" key={i}>
                <div className="g"><b>{t(`groups.${r.label}` as never)}</b><div className="muted">{recordValue(r)}</div></div>
              </div>
            )) : <p className="muted">{t('stats.notEnough')}</p>}
          </div>
        </div>

        <div className="tile t-ink glow s3">
          <span className="pill">{t('groups.voteOpen')}</span>
          <h2 style={{ margin: '14px 0 4px' }}>{t('groups.voteForMonth', { month: new Date(`${detail.vote.monthKey}-01`).toLocaleDateString(toLocale(language), { month: 'long' }) })}</h2>
          <p className="muted">{t('groups.voteQuestion')}</p>
          {detail.vote.candidates.length ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 12, marginTop: 10 }}>
              {detail.vote.candidates.map((c) => {
                const a = albumMeta(c.albumId);
                const totalVotes = detail.vote.candidates.reduce((s, x) => s + x.count, 0);
                const pct = totalVotes ? Math.round((c.count / totalVotes) * 100) : 0;
                const mine = detail.vote.myVote === c.albumId;
                return (
                  <div key={c.albumId}>
                    <CoverArt url={a?.cover} fallbackLetter={a?.artist[0] || '?'} className="cov" style={{ width: '100%', aspectRatio: '1' }} />
                    <b style={{ display: 'block', margin: '8px 0 2px', fontSize: 14 }}>{a ? a.title : '…'}</b>
                    <div className="meter" style={{ height: 10 }}><i style={{ width: `${(c.count / voteTop) * 100}%` }} /></div>
                    <small style={{ fontWeight: 700 }}>{t('groups.voteCount', { count: c.count })} · {pct}%</small>
                    <button className={`btn${mine ? '' : ' ghost'}`} style={{ width: '100%', marginTop: 8, padding: 8 }} onClick={() => castVote(c.albumId)} aria-pressed={mine}>
                      {mine ? t('groups.yourVote') : t('groups.voteBtn')}
                    </button>
                  </div>
                );
              })}
            </div>
          ) : <p className="muted" style={{ marginTop: 10 }}>{t('groups.noCandidates')}</p>}
          {detail.vote.candidates.length > 0 && (
            <p className="muted" style={{ marginTop: 10 }}>{detail.vote.myVote ? t('groups.voteChangeHint') : t('groups.voteHint')}</p>
          )}
        </div>

        <div className="tile s2">
          <h3>{t('groups.topAlbumsTitle')}</h3>
          <div className="stack" style={{ marginTop: 10 }}>
            {detail.topAlbums.length ? detail.topAlbums.map((row) => {
              const a = albumMeta(row.albumId);
              return (
                <button className="row" key={row.albumId} onClick={() => a && openAlbum(a.id)} style={{ cursor: a ? 'pointer' : 'default' }}>
                  <CoverArt url={a?.cover} fallbackLetter={a?.artist[0] || '?'} className="cov" style={{ width: 36, height: 36 }} />
                  <div className="g"><b>{a ? a.title : '…'}</b><div className="muted">{a?.artist}</div></div>
                  <span style={{ color: accentMix(row.avgScore / 5) }}>{starsText(row.avgScore)}</span>
                  <small className="muted">{row.count}</small>
                </button>
              );
            }) : <p className="muted">{t('stats.notEnough')}</p>}
          </div>
        </div>

        {detail.taste && (
          <div className="tile t-ac">
            <h3>{t('groups.tasteTitle')}</h3>
            <span className="num" style={{ fontSize: 'clamp(32px,5vw,48px)' }}>{detail.taste.avgMatch}%</span>
            <p>{t('groups.tasteAvg')}</p>
            {detail.taste.closest && <p className="muted" style={{ marginTop: 8 }}>{t('groups.tasteClosest', { a: detail.taste.closest.a.name, b: detail.taste.closest.b.name, pct: detail.taste.closest.pct })}</p>}
            {detail.taste.furthest && <p className="muted">{t('groups.tasteFurthest', { a: detail.taste.furthest.a.name, b: detail.taste.furthest.b.name, pct: detail.taste.furthest.pct })}</p>}
          </div>
        )}

        <div className="tile s2">
          <div className="setrow" style={{ border: 0, padding: 0 }}>
            <h3 style={{ marginBottom: 0 }}>{t('groups.inviteByHandle')}</h3>
          </div>
          <div className="acts" style={{ marginTop: 10 }}>
            <input className="field" style={{ flex: 1 }} placeholder={t('groups.inviteHandle')} value={inviteHandle} onChange={(e) => setInviteHandle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') invite(); }} />
            <button className="btn" onClick={invite}>{t('groups.invite')}</button>
          </div>
        </div>

        <div className="tile">
          <h3>{t('groups.activity')}</h3>
          <div className="stack" style={{ marginTop: 10 }}>
            {detail.activity.length ? detail.activity.map((ev, i) => {
              const a = liveAlbums[ev.albumId] || albums.find((x) => x.id === ev.albumId);
              return (
                <button className="row" key={i} onClick={() => a && openAlbum(a.id)} style={{ cursor: a ? 'pointer' : 'default' }}>
                  <CoverArt url={a?.cover} fallbackLetter={ev.user.name[0] || '?'} className="cov" style={{ width: 36, height: 36 }} />
                  <div className="g">
                    <b>{ev.user.name}</b>
                    <div className="muted">{ev.type === 'review' ? t('groups.wroteAbout') : t('groups.rated')} {a ? a.title : '…'}</div>
                  </div>
                  <span style={{ color: accentMix(ev.stars / 5) }}>{starsText(ev.stars)}</span>
                </button>
              );
            }) : <p className="muted">{t('groups.noActivity')}</p>}
          </div>
        </div>

        <div className="tile s3">
          {leavingConfirm ? (
            <>
              <h3>{t('groups.leaveConfirmTitle', { name: detail.name })}</h3>
              <p className="muted">{t('groups.leaveConfirmBody')}</p>
              <div className="acts" style={{ marginTop: 10 }}>
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
