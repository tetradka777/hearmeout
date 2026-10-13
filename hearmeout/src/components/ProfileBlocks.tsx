'use client';

import { useApp } from '@/lib/AppContext';
import { CoverArt } from './ui/CoverArt';
import { ArtistName } from './ui/ArtistName';
import { fmt1 } from '@/lib/numberFormat';
import { HeartIcon } from './ui/Icons';
import { sizedImage } from '@/lib/imageSize';

// vProfile()'s loveRows(kind,keys), with rev 9's covers and counts: tracks
// show their album cover, albums their year and your score, artists their
// photo; albums open the album page, artists the artist page.
export function LovedTracksColumn() {
  const { t, lovedItems, toggleLoved } = useApp();
  const items = lovedItems.filter((li) => li.type === 'track');
  if (!items.length) return <p className="muted" style={{ fontWeight: 600 }}>{t('profile.lovedEmptyTrack')}</p>;
  return (
    <>
      {items.map((li) => (
        <div className="row" key={li.id}>
          <CoverArt url={li.cover ?? undefined} fallbackLetter={(li.artist || li.title)[0] || '?'} className="cov" px={44} style={{ width: 44, height: 44 }} />
          <span className="g"><b>{li.title}</b>{li.artist && <small className="muted" style={{ fontWeight: 600 }}><ArtistName name={li.artist} size={16} /></small>}</span>
          <button className="ib love on" onClick={() => toggleLoved(li.type, li.title, li.artist, li.itemId, li.cover)} aria-pressed="true" aria-label={t('album.removeFromLoved')}><HeartIcon /></button>
        </div>
      ))}
    </>
  );
}

export function LovedAlbumsColumn() {
  const { t, lovedItems, toggleLoved, albums, liveAlbums, openAlbum, myRatings } = useApp();
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
              <span className="g"><b>{li.title}</b><small className="muted" style={{ fontWeight: 600 }}>{(() => {
                const mine = a ? myRatings.find((r) => r.albumId === a.id)?.stars : undefined;
                const rest = [a?.year || null, mine != null ? t('stats.youRated', { score: fmt1(mine) }) : null].filter(Boolean).join(' · ');
                return <>{li.artist && <ArtistName name={li.artist} id={a?.artistId} size={16} />}{rest ? `${li.artist ? ' · ' : ''}${rest}` : null}</>;
              })()}</small></span>
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
          <button className="rowlink" onClick={() => li.itemId && openSpotifyArtist(li.itemId, li.title)} style={{ cursor: li.itemId ? 'pointer' : 'default' }}>
            <span className="dot" style={li.cover ? { backgroundImage: `url('${sizedImage(li.cover, 44)}')`, backgroundSize: 'cover', color: 'transparent' } : undefined}>{li.title[0]}</span>
            <span className="g"><b>{li.title}</b></span>
          </button>
          <button className="ib love on" onClick={() => toggleLoved(li.type, li.title, li.artist, li.itemId, li.cover)} aria-pressed="true" aria-label={t('album.removeFromLoved')}><HeartIcon /></button>
        </div>
      ))}
    </>
  );
}
