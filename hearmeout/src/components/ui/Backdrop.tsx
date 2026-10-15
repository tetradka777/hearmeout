'use client';

import type { CSSProperties, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '@/lib/AppContext';
import { sizedImage } from '@/lib/imageSize';
import type { ScreenName } from '@/lib/types';
import { useAlbums } from '@/lib/useAlbum';

// The page's background behind the glass cards: a picture (the album's
// cover, the artist's photo…), several pictures as a soft collage, or a
// few colours — blurred, fixed to the screen and frosted towards the
// theme's background (rev15.css .abg17). Shown only while `screen` is the
// open one; put on the shell (.rd) because a screen moves while it fades
// in, which would carry a fixed element with it.
export function PageBackdrop({ screen, image, images, colors }: {
  screen: ScreenName | ScreenName[];
  image?: string | null;
  images?: (string | null | undefined)[];
  colors?: string[];
}) {
  const { state } = useApp();
  const screens = Array.isArray(screen) ? screen : [screen];
  if (!screens.includes(state.activeScreen) || typeof document === 'undefined') return null;
  const host = document.querySelector('.rd');
  if (!host) return null;

  const pics = (images ?? []).filter((x): x is string => !!x).slice(0, 4);
  let body: ReactNode = null;
  let style: CSSProperties | undefined;
  if (image) {
    style = { ['--cvbg' as string]: `url('${sizedImage(image, 640) ?? image}')` } as CSSProperties;
  } else if (pics.length) {
    // A collage: the covers in a grid, all blurred together.
    body = (
      <span className={`clg17 n${pics.length}`}>
        {pics.map((p, i) => <i key={i} style={{ backgroundImage: `url('${sizedImage(p, 300) ?? p}')` }} />)}
      </span>
    );
  } else if (colors?.length) {
    style = { background: colors.length > 1 ? `linear-gradient(135deg, ${colors.join(', ')})` : colors[0] };
  } else {
    return null;
  }
  return createPortal(<div className="abg17" style={style} aria-hidden="true">{body}</div>, host);
}

// Screens without a picture of their own (home, search, stats, history,
// Listen later, groups) sit on what you've been playing lately: a collage
// of your latest albums' covers, so the background moves with the music.
// Without any, the theme's colours.
const AMBIENT: ScreenName[] = ['catalog', 'discover', 'stats', 'history', 'later', 'groups'];

export function AmbientBackdrop() {
  const { feed, myRatings, spotifyCovers } = useApp();
  const ids = (feed?.recentAlbumIds?.length ? feed.recentAlbumIds : [...myRatings].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).map((r) => r.albumId)).slice(0, 4);
  const albums = useAlbums(ids);
  const covers = albums.map(({ album }) => spotifyCovers[album.id] || album.cover).filter(Boolean);
  return covers.length
    ? <PageBackdrop screen={AMBIENT} images={covers} />
    : <PageBackdrop screen={AMBIENT} colors={['var(--pal)', 'var(--ac)']} />;
}
