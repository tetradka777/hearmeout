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

// A swipe switches the album when it goes far enough or fast enough.
const SWIPE_PX = 48;
const FLICK_PX_PER_MS = 0.3;
// Movement under this is a tap, not a swipe.
const TAP_PX = 8;

type Drag = { id: number; x: number; y: number; t: number; dy: number; vertical: boolean | null };

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
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState<'up' | 'down'>('up');
  const [dy, setDy] = useState(0);
  const drag = useRef<Drag | null>(null);
  const swiped = useRef(false);

  if (!known.length) return null;
  const i = Math.min(index, known.length - 1);
  const { id, album } = known[i];
  const pick = list.find((y) => y.albumId === id)!;
  const cover = spotifyCovers[album.id] || album.cover;
  const many = known.length > 1;
  const show = (n: number, d: 'up' | 'down') => { setDir(d); setIndex((n + known.length) % known.length); };
  const names = pick.fans.map((f) => f.name);

  const onDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    swiped.current = false;
    if (!many) return;
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp, dy: 0, vertical: null };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const ddx = e.clientX - d.x, ddy = e.clientY - d.y;
    // The first clear movement decides: sideways isn't a swipe here.
    if (d.vertical === null && Math.max(Math.abs(ddx), Math.abs(ddy)) > TAP_PX) d.vertical = Math.abs(ddy) > Math.abs(ddx);
    if (!d.vertical) return;
    d.dy = ddy;
    // A little resistance, so it feels held rather than slid away.
    setDy(Math.sign(ddy) * Math.min(90, Math.abs(ddy) * 0.6));
  };
  const onUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    drag.current = null;
    setDy(0);
    if (!d || d.id !== e.pointerId || !d.vertical) return;
    const speed = Math.abs(d.dy) / Math.max(1, e.timeStamp - d.t);
    if (Math.abs(d.dy) >= SWIPE_PX || (Math.abs(d.dy) > 20 && speed > FLICK_PX_PER_MS)) {
      swiped.current = true;
      if (d.dy < 0) show(i + 1, 'up');
      else show(i - 1, 'down');
    } else if (Math.abs(d.dy) > TAP_PX) {
      swiped.current = true;
    }
  };

  return (
    <section className="sh14 fp20">
      <div className="hd"><h2>{t('home.friendsLovedTitle')}</h2></div>
      <div className="tile bh15 crd" style={blurStyle(cover ? sizedImage(cover, 150) ?? cover : null)}>
        <div key={id} className={`in ${dir}${dy ? ' drg' : ''}`} style={dy ? { transform: `translateY(${dy}px)`, opacity: 1 - Math.abs(dy) / 220 } : undefined}>
          <div className="l">
            <button
              className={`cv${many ? ' sw' : ''}`}
              aria-label={album.title}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={() => { drag.current = null; setDy(0); }}
              onClick={() => { if (!swiped.current) openAlbum(album.id); swiped.current = false; }}
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
