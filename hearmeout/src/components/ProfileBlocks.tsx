'use client';

import { useApp } from '@/lib/AppContext';
import { CoverArt } from './ui/CoverArt';
import { HeartIcon } from './ui/Icons';

// vProfile()'s loveRows(kind,keys): three distinct row shapes per type, not
// one merged list — tracks are plain text (no cover, no click-through),
// albums link to the album/rate page, artists link to the artist page.
export function LovedTracksColumn() {
  const { t, lovedItems, toggleLoved } = useApp();
  const items = lovedItems.filter((li) => li.type === 'track');
  if (!items.length) return <p className="muted" style={{ fontWeight: 600 }}>{t('profile.lovedEmptyTrack')}</p>;
  return (
    <>
      {items.map((li) => (
        <div className="row" key={li.id}>
          <span className="g"><b>{li.title}</b>{li.artist && <small className="muted" style={{ fontWeight: 600 }}>{li.artist}</small>}</span>
          <button className="ib love on" onClick={() => toggleLoved(li.type, li.title, li.artist, li.itemId, li.cover)} aria-pressed="true" aria-label={t('album.removeFromLoved')}><HeartIcon /></button>
        </div>
      ))}
    </>
  );
}

export function LovedAlbumsColumn() {
  const { t, lovedItems, toggleLoved, albums, liveAlbums, openAlbum } = useApp();
  const items = lovedItems.filter((li) => li.type === 'album');
  if (!items.length) return <p className="muted" style={{ fontWeight: 600 }}>{t('profile.lovedEmptyAlbum')}</p>;
  return (
    <>
      {items.map((li) => {
        const a = li.itemId ? (liveAlbums[li.itemId] || albums.find((x) => x.id === li.itemId || x.spotifyId === li.itemId)) : undefined;
        return (
          <div className="row" key={li.id}>
            <button className="rowlink" onClick={() => a && openAlbum(a.id)} style={{ cursor: a ? 'pointer' : 'default' }}>
              <CoverArt url={li.cover ?? undefined} fallbackLetter={(li.artist || li.title)[0] || '?'} className="cov" style={{ width: 44, height: 44 }} />
              <span className="g"><b>{li.title}</b><small className="muted" style={{ fontWeight: 600 }}>{li.artist}</small></span>
            </button>
            <button className="ib love on" onClick={() => toggleLoved(li.type, li.title, li.artist, li.itemId, li.cover)} aria-pressed="true" aria-label={t('album.removeFromLoved')}><HeartIcon /></button>
          </div>
        );
      })}
    </>
  );
}

export function LovedArtistsColumn() {
  const { t, lovedItems, toggleLoved, openSpotifyArtist } = useApp();
  const items = lovedItems.filter((li) => li.type === 'artist');
  if (!items.length) return <p className="muted" style={{ fontWeight: 600 }}>{t('profile.lovedEmptyArtist')}</p>;
  return (
    <>
      {items.map((li) => (
        <div className="row" key={li.id}>
          <button className="rowlink" onClick={() => li.itemId && openSpotifyArtist(li.itemId)} style={{ cursor: li.itemId ? 'pointer' : 'default' }}>
            <span className="dot" style={li.cover ? { backgroundImage: `url('${li.cover}')`, backgroundSize: 'cover', color: 'transparent' } : undefined}>{li.title[0]}</span>
            <span className="g"><b>{li.title}</b></span>
          </button>
          <button className="ib love on" onClick={() => toggleLoved(li.type, li.title, li.artist, li.itemId, li.cover)} aria-pressed="true" aria-label={t('album.removeFromLoved')}><HeartIcon /></button>
        </div>
      ))}
    </>
  );
}
