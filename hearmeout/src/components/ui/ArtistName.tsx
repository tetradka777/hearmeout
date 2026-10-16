'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent } from 'react';
import { useApp } from '@/lib/AppContext';
import { useArtistPhoto } from '@/lib/artistPhotos';
import { sizedImage } from '@/lib/imageSize';
import { prefetchArtist } from '@/lib/prefetchPages';

// Opens an artist's page from just a name (most rows only carry the name):
// the Spotify id is looked up on click. A known id skips the lookup.
export function useOpenArtist() {
  const { t, openSpotifyArtist, showToast } = useApp();
  return useCallback(async (name: string, id?: string | null) => {
    if (id) { openSpotifyArtist(id, name); return; }
    try {
      const res = await fetch(`/api/spotify/resolve-artist?name=${encodeURIComponent(name)}`);
      if (!res.ok) { showToast(t('toast.artistOpenFailed')); return; }
      openSpotifyArtist((await res.json()).id, name);
    } catch {
      showToast(t('toast.artistOpenFailed'));
    }
  }, [t, openSpotifyArtist, showToast]);
}

// True once the element has been on screen (and stays true), so avatars on
// hidden screens or far down a list don't ask for photos yet.
function useSeen<T extends Element>() {
  const ref = useRef<T | null>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    if (typeof IntersectionObserver === 'undefined') { setSeen(true); return; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setSeen(true); io.disconnect(); }
    }, { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  return [ref, seen] as const;
}

// A round artist photo, or the first letter until (or unless) there is one.
export function ArtistAvatar({ name, id, size = 18, photo: known, style }: { name: string; id?: string | null; size?: number; photo?: string | null; style?: CSSProperties }) {
  const [ref, seen] = useSeen<HTMLSpanElement>();
  const looked = useArtistPhoto(name, seen && !known, id);
  const photo = known || looked || null;
  const url = photo ? sizedImage(photo, size) : null;
  return (
    <span
      ref={ref}
      className="aav"
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.48)), ...(url ? { backgroundImage: `url('${url}')` } : null), ...style }}
    >
      {!url && (name.trim()[0] || '?')}
    </span>
  );
}

// An artist's name with their photo before it, opening their page. Made of
// spans (not a button) so it can sit inside a row that is itself a button:
// the click is kept from reaching the row.
//
// Without an id the page is found by name, which can't tell namesakes apart
// (three different "Miley"s). albumId helps: when the row's album is known
// and credits an artist with this name, that artist's exact id is used.
export function ArtistName({ name, id: givenId, albumId, size = 18, className = '', style, noAvatar }: { name: string; id?: string | null; albumId?: string | null; size?: number; className?: string; style?: CSSProperties; noAvatar?: boolean }) {
  const openArtist = useOpenArtist();
  const { t, albums, liveAlbums } = useApp();
  const album = !givenId && albumId ? liveAlbums[albumId] || albums.find((a) => a.id === albumId || a.spotifyId === albumId) : undefined;
  const sameName = (x: string) => x.trim().toLowerCase() === name.split(',')[0].trim().toLowerCase();
  const id = givenId || (album?.artistId && album.artist.split(',').map((x) => x.trim()).some(sameName) ? album.artistId : null);
  if (!name) return null;
  const go = (e: MouseEvent | KeyboardEvent) => {
    e.stopPropagation();
    e.preventDefault();
    openArtist(name, id);
  };
  return (
    <span
      className={`arl ${className}`.trim()}
      role="link"
      tabIndex={0}
      aria-label={t('artist.openNamed', { name })}
      onClick={go}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') go(e); }}
      // The page starts loading the moment you point at the link.
      onPointerEnter={() => prefetchArtist(id)}
      onPointerDown={() => prefetchArtist(id)}
      onFocus={() => prefetchArtist(id)}
      style={style}
    >
      {!noAvatar && <ArtistAvatar name={name} id={id} size={size} />}
      <span className="arn">{name}</span>
    </span>
  );
}
