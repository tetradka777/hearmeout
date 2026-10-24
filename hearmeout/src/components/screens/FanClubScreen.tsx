'use client';

import { useState } from 'react';
import { useApp } from '@/lib/AppContext';
import { usePlayer } from '@/lib/PlayerContext';
import { invalidateJson, useCachedJson } from '@/lib/cachedJson';
import type { Device } from '@/lib/types';
import type { FanClubPage } from '@/app/api/fanclubs/[id]/route';
import { ArtistAvatar } from '../ui/ArtistName';
import { CoverWall, PersonCards, toneClass } from '../ui/Visual';

// A fan club's own page (fan clubs are artist follows): the artist big on
// a coloured card with join / leave and a way to the artist page, which of
// your friends are in it, and what the club has been playing of this
// artist lately — tap a cover to hear it.
export function FanClubScreen(_props: { device: Device }) {
  const { t, state, goBack, openSpotifyArtist, viewFriend, showToast } = useApp();
  const { playQueue } = usePlayer();
  const club = state.viewingFanClub;
  const url = club ? `/api/fanclubs/${club.id}?name=${encodeURIComponent(club.name)}` : null;
  const page = useCachedJson<FanClubPage>(url);
  const [busy, setBusy] = useState(false);
  if (!club) return null;
  const data = page.data;
  const name = data?.artist.name || club.name;

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

  return (
    <>
      <button className="crumb" onClick={() => goBack('groups')}>‹ {t('fanclub.back')}</button>
      <div className={`tile fch15 ${toneClass(name)}`}>
        <ArtistAvatar name={name} id={club.id} photo={data?.artist.photo} size={128} />
        <div className="g">
          <p className="k">{t('fanclub.eyebrow')}</p>
          <h1>{name}</h1>
          {data && <p className="m">{data.members > 0 ? t('fandoms.members', { n: data.members }) : t('fandoms.beFirst')}</p>}
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
            <h2>{t('fanclub.friendsIn')}</h2>
            {data.friends.length
              ? <PersonCards people={data.friends.map((f) => ({ id: f.id, name: f.name, avatarUrl: f.avatarUrl, sub: `@${f.handle.replace(/^@/, '')}`, onClick: () => viewFriend(f.id) }))} />
              : <p className="muted" style={{ fontWeight: 600 }}>{t('fanclub.noFriends')}</p>}
          </div>

          <div className="sec">
            <h2>{t('fanclub.onRepeat')}</h2>
            {data.tracks.length ? (
              <CoverWall items={data.tracks.map((tr, i) => ({
                key: `${i}-${tr.title}`, cover: tr.cover, title: tr.title, sub: t('fanclub.listenersN', { n: tr.listeners }),
                onClick: () => playQueue(data.tracks.map((x) => ({ title: x.title, artist: name, cover: x.cover, albumId: x.albumId })), i),
              }))} />
            ) : <p className="muted" style={{ fontWeight: 600 }}>{t('fanclub.nothingYet')}</p>}
          </div>
        </>
      )}
    </>
  );
}
