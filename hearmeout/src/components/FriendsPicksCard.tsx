'use client';

import { useMemo } from 'react';
import { useApp } from '@/lib/AppContext';
import { useCachedJson } from '@/lib/cachedJson';
import { useAlbums } from '@/lib/useAlbum';
import { userAvatarStyle } from '@/lib/format';
import type { Recommendation } from '@/app/api/recommendations/route';
import { AlbumShelfCard, Shelf } from './ui/SuperCards';
import { Initial } from './ui/Initial';

// The same real friend recommendations, in a horizontal shelf with a
// readable recommendation underneath each album. No hidden vertical deck.
export function FriendsPicksCard() {
  const { t, openAlbum, spotifyCovers, myRatings, viewFriend } = useApp();
  const { data } = useCachedJson<Recommendation[]>('/api/recommendations');
  const rated = useMemo(() => new Set(myRatings.map((r) => r.albumId)), [myRatings]);
  const list = (data || []).filter((r) => !rated.has(r.albumId));
  const known = useAlbums(list.map((x) => x.albumId)).slice(0, 10);
  if (!known.length) return null;
  return <Shelf title={t('home.friendsLovedTitle')} className="picks28">
    {known.map(({ id, album }) => {
      const pick = list.find((x) => x.albumId === id)!;
      const first = pick.fans[0];
      return <div className="pick28" key={id}>
        <AlbumShelfCard cover={spotifyCovers[album.id] || album.cover} title={album.title} artist={album.artist} artistId={album.artistId} score={pick.avg} onClick={() => openAlbum(album.id)} />
        <div className="pick28who">
          <span className="pick28faces">{pick.fans.slice(0, 3).map((f) => <button key={f.id} className="dot" aria-label={f.name} style={userAvatarStyle(f)} onClick={() => viewFriend(f.id)}>{!f.avatarUrl && <Initial name={f.name} />}</button>)}</span>
          <small>{pick.fans.length > 1 ? t('home.lovedByMany', { name: first?.name ?? '', n: pick.fans.length - 1 }) : t('home.lovedBy', { name: first?.name ?? '' })}</small>
        </div>
      </div>;
    })}
  </Shelf>;
}
