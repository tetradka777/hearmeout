'use client';

import { useApp } from '@/lib/AppContext';
import { fmt1 } from '@/lib/numberFormat';
import { HeartIcon } from './ui/Icons';
import { CoverWall } from './ui/Visual';
import { ArtistShelfCard } from './ui/SuperCards';

// Loved things as pictures, not rows (rev 9's covers and counts kept):
// tracks and albums as walls of covers, artists as photo cards; a heart on
// each cover takes it out of Loved; albums open the album page, artists
// the artist page.
function UnloveButton({ type, title, artist, itemId, cover }: { type: 'track' | 'album' | 'artist'; title: string; artist: string | null; itemId: string | null; cover: string | null }) {
  const { t, toggleLoved } = useApp();
  return <button className="ib love on" onClick={() => toggleLoved(type, title, artist, itemId, cover)} aria-pressed="true" aria-label={t('album.removeFromLoved')}><HeartIcon /></button>;
}

export function LovedTracksColumn() {
  const { t, lovedItems } = useApp();
  const items = lovedItems.filter((li) => li.type === 'track');
  if (!items.length) return <p className="muted" style={{ fontWeight: 600 }}>{t('profile.lovedEmptyTrack')}</p>;
  return (
    <CoverWall items={items.map((li) => ({
      key: String(li.id), cover: li.cover, title: li.title, artist: li.artist,
      corner: <UnloveButton type="track" title={li.title} artist={li.artist} itemId={li.itemId} cover={li.cover} />,
    }))} />
  );
}

export function LovedAlbumsColumn() {
  const { t, lovedItems, albums, liveAlbums, openAlbum, myRatings } = useApp();
  const items = lovedItems.filter((li) => li.type === 'album');
  if (!items.length) return <p className="muted" style={{ fontWeight: 600 }}>{t('profile.lovedEmptyAlbum')}</p>;
  return (
    <CoverWall items={items.map((li) => {
      const a = li.itemId ? (liveAlbums[li.itemId] || albums.find((x) => x.id === li.itemId || x.spotifyId === li.itemId)) : undefined;
      const mine = a ? myRatings.find((r) => r.albumId === a.id)?.stars : undefined;
      return {
        key: String(li.id), cover: li.cover, title: li.title, artist: li.artist, artistId: a?.artistId,
        badge: mine != null ? fmt1(mine) : undefined, sub: a?.year ? String(a.year) : undefined,
        onClick: a ? () => openAlbum(a.id) : undefined,
        corner: <UnloveButton type="album" title={li.title} artist={li.artist} itemId={li.itemId} cover={li.cover} />,
      };
    })} />
  );
}

export function LovedArtistsColumn() {
  const { t, lovedItems, openSpotifyArtist } = useApp();
  const items = lovedItems.filter((li) => li.type === 'artist');
  if (!items.length) return <p className="muted" style={{ fontWeight: 600 }}>{t('profile.lovedEmptyArtist')}</p>;
  return (
    <div className="hrow sr14">
      {items.map((li) => (
        <ArtistShelfCard key={li.id} name={li.title} id={li.itemId} photo={li.cover} onClick={() => li.itemId && openSpotifyArtist(li.itemId, li.title)} />
      ))}
    </div>
  );
}
