'use client';

import { useMemo, useRef, useState } from 'react';
import { useApp } from '@/lib/AppContext';
import { useCachedJson } from '@/lib/cachedJson';
import { useAlbums } from '@/lib/useAlbum';
import { blurStyle } from '@/lib/imageColor';
import { sizedImage } from '@/lib/imageSize';
import { fmt1 } from '@/lib/numberFormat';
import { shortTitle, userAvatarStyle } from '@/lib/format';
import type { Recommendation } from '@/app/api/recommendations/route';
import { CoverArt } from './ui/CoverArt';
import { ArtistName } from './ui/ArtistName';

const SWIPE_PX = 36;

// Home → "picks from friends": one wide card, one album at a time — the
// cover with its title and artist on the left, the friends' average and who
// loved it on the right, the cover blurred behind. Swipe the cover up or
// down (or use the arrows / dots) for the next or previous pick.
export function FriendsPicksCard() {
  const { t, openAlbum, spotifyCovers, myRatings } = useApp();
  const { data } = useCachedJson<Recommendation[]>('/api/recommendations');
  const rated = useMemo(() => new Set(myRatings.map((r) => r.albumId)), [myRatings]);
  const list = (data || []).filter((r) => !rated.has(r.albumId));
  const known = useAlbums(list.map((x) => x.albumId)).slice(0, 10);
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState<'up' | 'down'>('up');
  const start = useRef<{ y: number; x: number } | null>(null);
  const moved = useRef(false);

  if (!known.length) return null;
  const i = Math.min(index, known.length - 1);
  const { id, album } = known[i];
  const pick = list.find((y) => y.albumId === id)!;
  const cover = spotifyCovers[album.id] || album.cover;
  const go = (step: number) => {
    if (known.length < 2) return;
    setDir(step > 0 ? 'up' : 'down');
    setIndex((i + step + known.length) % known.length);
  };
  const names = pick.fans.map((f) => f.name);

  return (
    <section className="sh14 fp20">
      <div className="hd"><h2>{t('home.friendsLovedTitle')}</h2></div>
      <div className="tile bh15 crd" style={blurStyle(cover ? sizedImage(cover, 300) ?? cover : null)}>
        <div key={id} className={`in ${dir}`}>
          <div className="l">
            <button
              className="cv"
              aria-label={album.title}
              onPointerDown={(e) => { start.current = { y: e.clientY, x: e.clientX }; moved.current = false; }}
              onPointerUp={(e) => {
                const s = start.current;
                start.current = null;
                if (!s) return;
                const dy = e.clientY - s.y;
                if (Math.abs(dy) >= SWIPE_PX && Math.abs(dy) > Math.abs(e.clientX - s.x)) { moved.current = true; go(dy < 0 ? 1 : -1); }
              }}
              onPointerCancel={() => { start.current = null; }}
              onClick={() => { if (!moved.current) openAlbum(album.id); }}
            >
              <CoverArt url={cover} fallbackLetter={album.artist[0] || '?'} className="cov" px={300} style={{ width: '100%', aspectRatio: '1' }} />
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
        {known.length > 1 && (
          <div className="pnv" role="group" aria-label={t('home.friendsLovedTitle')}>
            <button className="ar up" onClick={() => go(-1)} aria-label={t('picks.prev')}><i className="ic ic-chev" aria-hidden="true" /></button>
            <span className="dots">
              {known.map((k, n) => <button key={k.id} className={n === i ? 'on' : ''} aria-label={`${n + 1}`} aria-current={n === i} onClick={() => { setDir(n > i ? 'up' : 'down'); setIndex(n); }} />)}
            </span>
            <button className="ar dn" onClick={() => go(1)} aria-label={t('picks.next')}><i className="ic ic-chev" aria-hidden="true" /></button>
          </div>
        )}
      </div>
    </section>
  );
}
