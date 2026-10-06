'use client';

import { useApp } from '@/lib/AppContext';
import { fmt1 } from '@/lib/numberFormat';
import type { Album } from '@/lib/types';
import { CoverArt } from './CoverArt';

// albCard() in reference/app.js: cover with your score as a badge (when you
// rated it), title, then "artist · genre".
export function AlbumCard({ album, sub }: { album: Album; sub?: string }) {
  const { openAlbum, spotifyCovers, myRatings } = useApp();
  const mine = myRatings.find((r) => r.albumId === album.id);
  const cover = spotifyCovers[album.id] || album.cover;
  const genre = album.genreBucket || album.genre;
  return (
    <button onClick={() => openAlbum(album.id)} style={{ textAlign: 'left', color: 'inherit' }}>
      <div className="cvw">
        <CoverArt url={cover} fallbackLetter={album.artist[0] || '?'} className="cov" style={{ width: '100%', aspectRatio: '1' }} />
        {mine && <span className="bdg">{fmt1(mine.stars)}</span>}
      </div>
      <b style={{ display: 'block', marginTop: 10 }}>{album.title}</b>
      <small className="muted" style={{ fontWeight: 600 }}>{sub ?? `${album.artist}${genre ? ` · ${genre}` : ''}`}</small>
    </button>
  );
}
