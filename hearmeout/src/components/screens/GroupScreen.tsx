'use client';

import { useEffect, useState } from 'react';
import { Podium } from '../ui/Podium';
import { fmt1, fmtHours } from '@/lib/numberFormat';
import { useApp } from '@/lib/AppContext';
import { invitePath } from '@/lib/pendingInvite';
import type { Device, GroupDetail, GroupLeaderboardPeriod } from '@/lib/types';
import { userAvatarStyle, formatRelative } from '@/lib/format';
import { toLocale, pluralForKey } from '@/lib/i18n';
import { CoverArt } from '../ui/CoverArt';
import { useCachedJson } from '@/lib/cachedJson';
import { Phrase, TintBox } from '../ui/Visual';
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
  const heroCovers = detail.topAlbums.slice(0, 3);
  // The page's top card over its best album's cover, blurred.
  const heroAlbum = heroCovers[0] ? albumMeta(heroCovers[0].albumId) : undefined;
  const heroCover = heroAlbum ? spotifyCovers[heroAlbum.id] || heroAlbum.cover : null;

  return (
    <>
      <button className="crumb" onClick={() => goBack('groups')}>‹ {t('groups.allGroups')}</button>

      {/* Hero: the group on the left, its three best-rated albums on the right. */}
      <div className={`tile ghero9 ${heroCover ? 'bh15' : 't-ink glow'}`} style={blurStyle(heroCover)}>
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
          <div className="gh-r">
            <div className="hcs9">
              {heroCovers.map((row, i) => {
                const a = albumMeta(row.albumId);
                return (
                  <button key={row.albumId} className={i === 0 ? 'first' : ''} onClick={() => openAlbum(row.albumId)} aria-label={a?.title ?? row.albumId} title={a ? `${a.title} — ${a.artist}` : undefined}>
                    <CoverArt url={a?.cover} fallbackLetter={a?.artist[0] || '?'} className="cov" px={112} style={{ width: '100%', aspectRatio: '1' }} />
                    <span className="sc9">{fmt1(row.avgScore)}</span>
                  </button>
                );
              })}
            </div>
            <small>{t('groups.heroTopAlbums')}</small>
          </div>
        )}
      </div>

      {/* The group's numbers as one phrase. */}
      <div style={{ margin: '14px 0 4px' }}>
        <Phrase parts={[
          [`${Math.round(totalHours)} ${t('unit.h')}`, t(period === 'week' ? 'groups.listenedWeek' : 'groups.listenedMonth')],
          [totalRatingsThisMonth, t('groups.ratingsThisMonth')],
          [groupAvgScore ? `★ ${fmt1(groupAvgScore)}` : '–', t('groups.figAvg')],
        ]} />
      </div>

      <div className="bento b3">
        {/* Who listened most: the top three on a podium, everyone under it. */}
        <div className="tile t-c1 s2">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0 }}>{t('groups.leaderboard')}</h2>
            <div className="chips" style={{ margin: 0 }} role="group" aria-label={t('recap.periodLabel')}>
              <button className={`chip${period === 'week' ? ' on' : ''}`} onClick={() => changePeriod('week')}>{t('stats.thisWeek')}</button>
              <button className={`chip${period === 'month' ? ' on' : ''}`} onClick={() => changePeriod('month')}>{t('stats.thisMonth')}</button>
            </div>
          </div>
          <Podium
            label={t('groups.leaderboard')}
            entries={detail.leaderboard.map((row) => ({
              key: row.user.id,
              name: row.user.name,
              value: `${fmtHours(row.hours)}${t('unit.h')}`,
              you: row.user.id === me.id,
              avatar: { style: { ...userAvatarStyle(row.user), backgroundSize: 'cover' }, letter: !row.user.avatarUrl && row.user.name[0]?.toUpperCase() },
              onClick: row.user.id === me.id ? undefined : () => openMember(row.user.id),
              person: { id: row.user.id, name: row.user.name, avatarUrl: row.user.avatarUrl },
            }))}
          />
          <div className="mem13">
            {detail.leaderboard.map((row, i) => {
              const s = statOf(row.user.id);
              return (
                <button key={row.user.id} onClick={() => openMember(row.user.id)}>
                  <Av u={row.user} />
                  <b>{i + 1}. {row.user.name}</b>
                  <small>{fmtHours(row.hours)}{t('unit.h')}{row.user.id === detail.createdBy ? ` · ${t('groups.owner')}` : ''}</small>
                  {s && s.streakDays > 0 && <small className="fl13"><i className="ic ic-flame" /> {t('groups.streakChip', { n: s.streakDays })}</small>}
                </button>
              );
            })}
          </div>
        </div>

        {/* Group taste: the average match, the closest and the furthest pair. */}
        <div className="tile t-c3 tst13">
          <h2>{t('groups.tasteTitle')}</h2>
          <span className="big13">{detail.taste?.avgMatch != null ? `${detail.taste.avgMatch}%` : '–'}</span>
          <p className="muted" style={{ fontWeight: 700 }}>{t('groups.tasteAvg')}</p>
          {([['closest', t('groups.tasteClosestLabel')], ['furthest', t('groups.tasteFurthestLabel')]] as const).map(([k, label]) => {
            const pair = detail.taste?.[k];
            if (!pair) return null;
            return (
              <div className="pr13" key={k}>
                <span className="avs"><Av u={pair.a} /><Av u={pair.b} /></span>
                <span className="g">
                  <small className="muted" style={{ fontWeight: 800 }}>{label}</small>
                  <b>{t('groups.pairNames', { a: pair.a.name, b: pair.b.name })}</b>
                  <span className="meter"><i style={{ width: `${pair.pct}%` }} /></span>
                </span>
                <span className="num">{pair.pct}%</span>
              </div>
            );
          })}
        </div>

        <div className="tile t-ink glow s3">
          <span className="pill">{t('groups.voteOpen')}</span>
          <h2 style={{ margin: '14px 0 4px' }}>{t('groups.voteForMonth', { month: voteMonth.toLocaleDateString(toLocale(language), { month: 'long' }) })}</h2>
          <p className="muted" style={{ fontWeight: 600, marginBottom: 16 }}>
            {t('groups.voteQuestion')} {t('groups.voteEnds', { date: voteEnd.toLocaleDateString(toLocale(language), { day: 'numeric', month: 'long' }) })}
          </p>
          {detail.vote.candidates.length ? (
            <div className="vt15">
              {detail.vote.candidates.map((c) => {
                const a = albumMeta(c.albumId);
                const pct = totalVotes ? Math.round((c.count / totalVotes) * 100) : 0;
                const mine = detail.vote.myVote === c.albumId;
                return (
                  <TintBox key={c.albumId} className="vc" picture={a?.cover} fallbackKey={c.albumId}>
                    <CoverArt url={a?.cover} fallbackLetter={a?.artist[0] || '?'} className="cov" px={170} style={{ width: '100%', aspectRatio: '1' }} />
                    <b className="vt">{a ? a.title : '…'}</b>
                    <div className="meter" style={{ height: 10 }}><i style={{ width: `${pct}%` }} /></div>
                    <small style={{ fontWeight: 700 }}>{t('groups.voteCount', { count: c.count, word: pluralForKey(language, c.count, 'groups.voteOne', 'groups.voteFew', 'groups.voteMany') })} · {pct}%</small>
                    <button className={`btn${mine ? '' : ' ghost'}`} style={{ width: '100%', padding: 8 }} onClick={() => castVote(c.albumId)} aria-pressed={mine}>
                      {mine ? t('groups.yourVote') : t('groups.voteBtn')}
                    </button>
                  </TintBox>
                );
              })}
            </div>
          ) : <p className="muted" style={{ fontWeight: 600 }}>{t('groups.noCandidates')}</p>}
        </div>

        {/* Latest ratings as covers you swipe through. */}
        <div className="tile t-c4 s3">
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
        <div className="tile t-soft2 s3">
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
