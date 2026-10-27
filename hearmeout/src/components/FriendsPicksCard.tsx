'use client';

import { useMemo } from 'react';
import { useApp } from '@/lib/AppContext';
import { useCachedJson } from '@/lib/cachedJson';
import { useSwipeDeck } from '@/lib/useSwipeDeck';
import { useAlbums } from '@/lib/useAlbum';
import { blurStyle } from '@/lib/imageColor';
import { sizedImage } from '@/lib/imageSize';
import { fmt1 } from '@/lib/numberFormat';
import { shortTitle, userAvatarStyle } from '@/lib/format';
import type { Recommendation } from '@/app/api/recommendations/route';
import { CoverArt } from './ui/CoverArt';
import { ArtistName } from './ui/ArtistName';

// Home → "picks from friends": one wide card, one album at a time — the
// cover with its title and artist on the left, the friends' average and who
// loved it on the right, the cover blurred behind. Swipe the cover up or
// down: the card follows the finger and lets go into the next or previous
// pick; the dots on the right show where you are and jump on a tap.
export function FriendsPicksCard() {
  const { t, openAlbum, spotifyCovers, myRatings } = useApp();
  const { data } = useCachedJson<Recommendation[]>('/api/recommendations');
  const rated = useMemo(() => new Set(myRatings.map((r) => r.albumId)), [myRatings]);
  const list = (data || []).filter((r) => !rated.has(r.albumId));
  const known = useAlbums(list.map((x) => x.albumId)).slice(0, 10);
  const deck = useSwipeDeck(known.length);

  if (!known.length) return null;
  const { i, many, show } = deck;
  const { id, album } = known[i];
  const pick = list.find((y) => y.albumId === id)!;
  const cover = spotifyCovers[album.id] || album.cover;
  const names = pick.fans.map((f) => f.name);

  return (
    <section className="sh14 fp20">
      <div className="hd"><h2>{t('home.friendsLovedTitle')}</h2></div>
      <div className="tile bh15 crd" style={blurStyle(cover ? sizedImage(cover, 150) ?? cover : null)}>
        <div key={id} className={deck.inClass} style={deck.inStyle}>
          <div className="l">
            <button
              className={`cv${many ? ' sw' : ''}`}
              aria-label={album.title}
              {...deck.handlers}
              onClick={() => { if (deck.tapped()) openAlbum(album.id); }}
            >
              <CoverArt url={cover} fallbackLetter={album.artist[0] || '?'} className="cov" px={300} style={{ width: '100%', height: '100%' }} />
            </button>
            <button className="tt" onClick={() => openAlbum(album.id)}>{shortTitle(album.title)}</button>
            <span className="ar"><ArtistName name={album.artist} id={album.artistId} size={15} /></span>
          </div>
          <div className="r">
            <span className="sc">★ {fmt1(pick.avg)}</span>
            <span className="fans" aria-hidden="true">
              {pick.fans.slice(0, 3).map((f) => <span key={f.id} className="dot" style={{ ...userAvatarStyle(f), backgroundSize: 'cover' }}>{!f.avatarUrl && f.name[0]?.toUpperCase()}</span>)}
            </span>
            <small className="who">{names.length > 1 ? t('home.lovedByMany', { name: names[0], n: names.length - 1 }) : t('home.lovedBy', { name: names[0] ?? '' })}</small>
          </div>
        </div>
        {many && (
          <div className="pnv dots" role="group" aria-label={t('home.friendsLovedTitle')}>
            {known.map((k, n) => <button key={k.id} className={n === i ? 'on' : ''} aria-label={`${n + 1}`} aria-current={n === i} onClick={() => show(n, n > i ? 'up' : 'down')} />)}
          </div>
        )}
      </div>
    </section>
  );
}
