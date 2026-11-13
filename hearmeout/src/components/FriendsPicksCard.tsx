'use client';

import { useMemo } from 'react';
import { useApp } from '@/lib/AppContext';
import { useCachedJson } from '@/lib/cachedJson';
import { useAlbums } from '@/lib/useAlbum';
import { fmt1 } from '@/lib/numberFormat';
import type { Recommendation } from '@/app/api/recommendations/route';
import { DarkCard, CardWho, Shelf } from './ui/SuperCards';
import { CoverArt } from './ui/CoverArt';
import { ArtistName } from './ui/ArtistName';

// Friend picks use the same photo-backed activity card as today's plays.
export function FriendsPicksCard() {
  const { t, openAlbum, spotifyCovers, myRatings, viewFriend } = useApp();
  const { data } = useCachedJson<Recommendation[]>('/api/recommendations');
  const rated = useMemo(() => new Set(myRatings.map(r => r.albumId)), [myRatings]);
  const list = (data || []).filter(r => !rated.has(r.albumId) && r.fans.length > 0).slice(0, 10);
  const known = useAlbums(list.map(x => x.albumId));
  if (!known.length) return null;
  return <Shelf loop title={t('home.friendsLovedTitle')} className="picks29">
    {known.map(({ id, album }) => {
      const pick = list.find(x => x.albumId === id)!;
      const first = pick.fans[0];
      const cover = spotifyCovers[album.id] || album.cover;
      return <DarkCard key={id} cover={cover} className="rvc15 fdc15 pick29"
        head={<CardWho user={first || {name: '', avatarUrl: null}} when={t('home.trendingFriends', {n: pick.fans.length})} onClick={first ? () => viewFriend(first.id) : undefined} />}
        onOpen={() => openAlbum(album.id)} openText
        aside={<button className="cvb" onClick={() => openAlbum(album.id)} aria-label={album.title}><CoverArt url={cover} fallbackLetter={album.artist[0] || '?'} className="cov" px={240} style={{width:'100%',aspectRatio:'1'}} /></button>}>
        <button className="ft15" onClick={() => openAlbum(album.id)}><span>{album.title}</span></button>
        <p className="s15 pick29score"><i className="ic ic-star" aria-hidden="true" />{fmt1(pick.avg)}</p>
        <p className="m15"><ArtistName name={album.artist} id={album.artistId} /></p>
      </DarkCard>;
    })}
  </Shelf>;
}
