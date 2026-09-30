'use client';

import { useEffect, useState } from 'react';
import { useApp } from '@/lib/AppContext';
import type { Device, GroupDetail } from '@/lib/types';
import { userAvatarStyle, starsText } from '@/lib/format';
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
  const { t, me, state, goBack, albums, liveAlbums, openAlbum, showToast, viewFriend } = useApp();
  const [detail, setDetail] = useState<GroupDetail | null>(null);
  const [inviteHandle, setInviteHandle] = useState('');

  const groupId = state.viewingGroupId;

  const load = () => {
    if (!groupId) return;
    fetch(`/api/groups/${groupId}`).then((r) => (r.ok ? r.json() : null)).then(setDetail);
  };
  useEffect(() => { setDetail(null); load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [groupId]);

  if (!me) return null;
  if (!detail) return (
    <>
      <button className="crumb" onClick={() => goBack('groups')}>‹ {t('groups.title')}</button>
      <p className="muted">{t('groups.loading')}</p>
    </>
  );

  const castVote = async (candidateId: string) => {
    const res = await fetch(`/api/groups/${groupId}/vote`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ candidateId }) });
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

  const totalHours = detail.leaderboard.reduce((s, r) => s + r.hours, 0);
  const memberOf = (id: string) => (id === me.id ? undefined : id);

  return (
    <>
      <button className="crumb" onClick={() => goBack('groups')}>‹ {t('groups.title')}</button>

      <div className="tile t-ink hero glow">
        <span className="pill">{t('groups.privateGroup')}</span>
        <h1>{detail.name}</h1>
        <p className="muted">{t('groups.memberCount', { count: detail.members.length })}</p>
        <div className="hrow" style={{ marginTop: 10 }}>
          {detail.members.map((m) => (
            <button key={m.id} className="dot" style={{ ...userAvatarStyle(m), width: 40, height: 40 }} onClick={() => m.id !== me.id && viewFriend(m.id)}>
              {m.name[0]}
            </button>
          ))}
        </div>
        <div className="acts">
          <button className="btn" onClick={async () => { await navigator.clipboard.writeText(window.location.origin); showToast(t('groups.inviteSuccess')); }}>{t('groups.invite')}</button>
        </div>
      </div>

      <div className="stats3">
        <div className="tile"><span className="num">{totalHours.toFixed(0)}h</span><small className="muted">listened this month</small></div>
        <div className="tile"><span className="num">{detail.activity.length}</span><small className="muted">{t('groups.activity')}</small></div>
        <div className="tile"><span className="num">{detail.members.length}</span><small className="muted">{t('groups.yourGroups')}</small></div>
      </div>

      <div className="bento b3">
        <div className="tile s2">
          <h3>{t('groups.leaderboard')}</h3>
          <div className="stack" style={{ marginTop: 10 }}>
            {detail.leaderboard.map((row, i) => (
              <button className="row" key={row.user.id} onClick={() => memberOf(row.user.id) && viewFriend(row.user.id)} style={{ cursor: 'pointer' }}>
                <span className="muted" style={{ width: 20 }}>{i + 1}</span>
                <div className="dot" style={userAvatarStyle(row.user)}>{row.user.name[0]}</div>
                <div className="g">
                  <b>{row.user.name}{row.user.id === me.id ? ` (${t('friend.you')})` : ''}</b>
                  <div className="meter" style={{ marginTop: 4 }}><i style={{ width: `${totalHours ? (row.hours / totalHours) * 100 : 0}%` }} /></div>
                </div>
                <small className="muted">{row.hours}h</small>
              </button>
            ))}
          </div>
        </div>

        {detail.awards.length > 0 && (
          <div className="tile">
            <h3>{t('groups.awards')}</h3>
            <div className="stack" style={{ marginTop: 10 }}>
              {detail.awards.map((a, i) => (
                <div className="row" key={i}>
                  <div className="g"><b>{t(AWARD_LABEL_KEY[a.label] as never)}</b><div className="muted">{a.winner?.name} — {a.detail}</div></div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="tile s2">
          <h3>{t('groups.members')}</h3>
          <div className="mgrid" style={{ marginTop: 10 }}>
            {detail.members.map((m) => (
              <button className="mcard" key={m.id} onClick={() => m.id !== me.id && viewFriend(m.id)}>
                <div className="top">
                  <div className="dot" style={userAvatarStyle(m)}>{m.name[0]}</div>
                  <b>{m.name}</b>
                  {m.id === detail.createdBy && <span className="tag">{t('groups.owner')}</span>}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="tile s3">
          <h3>{t('groups.voteOpen')}</h3>
          <p className="muted">{t('groups.voteQuestion')}</p>
          <div className="stack" style={{ marginTop: 10 }}>
            {detail.vote.counts.map((c) => (
              <button className="row" key={c.user.id} onClick={() => castVote(c.user.id)} style={{ cursor: 'pointer' }}>
                <div className="dot" style={userAvatarStyle(c.user)}>{c.user.name[0]}</div>
                <div className="g">
                  <b>{c.user.name}</b>
                  <div className="meter" style={{ marginTop: 4 }}><i style={{ width: `${detail.vote.counts[0]?.count ? (c.count / detail.vote.counts[0].count) * 100 : 0}%` }} /></div>
                </div>
                <span className="num" style={{ fontSize: 18 }}>{c.count}</span>
                {detail.vote.myVote === c.user.id && <span className="tag">✓</span>}
              </button>
            ))}
          </div>
          <p className="muted" style={{ marginTop: 10 }}>{detail.vote.myVote ? t('groups.voteChangeHint') : t('groups.voteHint')}</p>
        </div>

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
      </div>
    </>
  );
}
