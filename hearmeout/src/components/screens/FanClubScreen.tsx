'use client';

import { useState } from 'react';
import { useApp } from '@/lib/AppContext';
import { usePlayer } from '@/lib/PlayerContext';
import { invalidateJson, useCachedJson } from '@/lib/cachedJson';
import { blurStyle } from '@/lib/imageColor';
import { userAvatarStyle } from '@/lib/format';
import type { Device } from '@/lib/types';
import type { FanClubMember, FanClubPage } from '@/app/api/fanclubs/[id]/route';
import { ArtistAvatar } from '../ui/ArtistName';
import { CoverWall } from '../ui/Visual';

const TOP = 5;

// A fan club's own page (fan clubs are artist follows): the artist over
// their blurred photo with the club's numbers (members, plays this month,
// new this week) and join / leave; what the club has on repeat; who listens
// most; and the members themselves (you, friends and open profiles; the
// rest as a count).
export function FanClubScreen(_props: { device: Device }) {
  const { t, state, me, goBack, openSpotifyArtist, viewFriend, showToast } = useApp();
  const { playQueue } = usePlayer();
  const club = state.viewingFanClub;
  const url = club ? `/api/fanclubs/${club.id}?name=${encodeURIComponent(club.name)}` : null;
  const page = useCachedJson<FanClubPage>(url);
  const [busy, setBusy] = useState(false);
  if (!club) return null;
  const data = page.data;
  const name = data?.artist.name || club.name;
  const photo = data?.artist.photo ?? null;

  const toggle = async () => {
    if (!data || busy) return;
    setBusy(true);
    const res = await fetch(`/api/artist/${club.id}/follow`, data.joined
      ? { method: 'DELETE' }
      : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) }).catch(() => null);
    setBusy(false);
    if (!res?.ok) { showToast(t('artist.followFailed')); return; }
    if (!data.joined) showToast(t('artist.followedToast', { name }));
    invalidateJson('/api/fanclubs');
    invalidateJson(`/api/artist/${club.id}/follow`);
    await page.reload();
  };

  const shown = data?.shown ?? [];
  const top = shown.filter((m) => (m.plays ?? 0) > 0).sort((a, b) => (b.plays ?? 0) - (a.plays ?? 0)).slice(0, TOP);
  const maxPlays = Math.max(1, ...top.map((m) => m.plays ?? 0));
  const openMember = (m: FanClubMember) => { if (m.id !== me?.id) viewFriend(m.id); };

  return (
    <>
      <button className="crumb" onClick={() => goBack('groups')}>‹ {t('fanclub.back')}</button>
      <div className="tile bh15 fh23" style={blurStyle(photo, 300)}>
        <ArtistAvatar name={name} id={club.id} photo={photo} size={132} />
        <div className="g">
          <p className="k">{t('fanclub.eyebrow')}</p>
          <h1>{name}</h1>
          {data && (
            <div className="st15">
              <div><b>{data.members}</b><small>{t('fanclub.statMembers', { n: data.members })}</small></div>
              <div><b>{data.plays}</b><small>{t('fanclub.statPlays', { n: data.plays })}</small></div>
              <div><b>{data.newThisWeek}</b><small>{t('fanclub.statNew')}</small></div>
            </div>
          )}
          <div className="acts">
            <button className={`btn${data?.joined ? ' ghost' : ''}`} disabled={!data || busy} onClick={toggle}>
              {data?.joined ? t('fanclub.leave') : t('fandoms.join')}
            </button>
            <button className="btn ghost" onClick={() => openSpotifyArtist(club.id, name)}>{t('fanclub.artistPage')}</button>
          </div>
        </div>
      </div>

      {page.failed && !data ? <p className="muted" style={{ fontWeight: 600 }}>{t('fanclub.loadError')}</p> : data && (
        <>
          <div className="sec">
            <h2>{t('fanclub.onRepeat')}</h2>
            {data.tracks.length ? (
              <CoverWall row items={data.tracks.map((tr, i) => ({
                key: `${i}-${tr.title}`, cover: tr.cover, title: tr.title, sub: t('fanclub.listenersN', { n: tr.listeners }),
                onClick: () => playQueue(data.tracks.map((x) => ({ title: x.title, artist: name, cover: x.cover, albumId: x.albumId })), i),
              }))} />
            ) : <p className="muted" style={{ fontWeight: 600 }}>{t('fanclub.nothingYet')}</p>}
          </div>

          <div className="sec two fc23">
            <div className="tile">
              <h2>{t('fanclub.topListeners')}</h2>
              {top.length ? (
                <ol className="tl23">
                  {top.map((m, i) => (
                    <li key={m.id}>
                      <button onClick={() => openMember(m)}>
                        <span className="n">{i + 1}</span>
                        <span className="avt" style={userAvatarStyle(m)}>{!m.avatarUrl && m.name[0]?.toUpperCase()}</span>
                        <span className="g">
                          <b>{m.id === me?.id ? t('fanclub.you') : m.name}</b>
                          <i style={{ width: `${Math.max(6, Math.round(((m.plays ?? 0) / maxPlays) * 100))}%` }} />
                        </span>
                        <span className="v">{t('fanclub.playsN', { n: m.plays ?? 0 })}</span>
                      </button>
                    </li>
                  ))}
                </ol>
              ) : <p className="muted" style={{ fontWeight: 600 }}>{t('fanclub.nothingYet')}</p>}
            </div>

            <div className="tile">
              <h2>{t('fanclub.membersTitle')}</h2>
              {shown.length ? (
                <div className="mg23">
                  {shown.map((m) => (
                    <button key={m.id} onClick={() => openMember(m)} disabled={m.id === me?.id}>
                      <span className="avt" style={userAvatarStyle(m)}>{!m.avatarUrl && m.name[0]?.toUpperCase()}</span>
                      <b>{m.id === me?.id ? t('fanclub.you') : m.name}</b>
                      {m.friend && <small>{t('fanclub.friendTag')}</small>}
                    </button>
                  ))}
                </div>
              ) : <p className="muted" style={{ fontWeight: 600 }}>{t('fandoms.beFirst')}</p>}
              {data.hidden > 0 && <p className="muted mh23">{t('fanclub.hiddenN', { n: data.hidden })}</p>}
            </div>
          </div>
        </>
      )}
    </>
  );
}
