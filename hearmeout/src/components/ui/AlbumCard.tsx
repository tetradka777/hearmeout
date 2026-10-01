'use client';

import { useApp } from '@/lib/AppContext';
import type { Album } from '@/lib/types';
import { CoverArt } from './CoverArt';

export function AlbumCard({ album, rankBadge }: { album: Album; rankBadge?: number }) {
  const { t, openAlbum, albumRatings, spotifyCovers } = useApp();
  const rating = albumRatings[album.id];
  const cover = spotifyCovers[album.id] || album.cover;
  return (
    <button className="cvw" onClick={() => openAlbum(album.id)} style={{ textAlign: 'left' }}>
      <CoverArt url={cover} fallbackLetter={album.artist[0] || '?'} className="cov" style={{ width: '100%', aspectRatio: '1' }}>
        {rankBadge != null && <span className="bdg">#{rankBadge}</span>}
        {album.unknown ? album.artist : ''}
      </CoverArt>
      <div style={{ marginTop: 8 }}>
        <b>{album.title}</b>
        <div className="muted">{album.artist}{album.unknown ? ` · ${album.listeners}` : ''}</div>
        <div className="muted" style={{ fontSize: 11 }}>
          {rating ? `★ ${rating.avg.toFixed(1)} · ${rating.count}` : t('album.noRatings')}
        </div>
      </div>
    </button>
  );
}

export function AlbumListRow({ album, rank }: { album: Album; rank: number }) {
  const { openAlbum } = useApp();
  return (
    <button className="row" onClick={() => openAlbum(album.id)} style={{ cursor: 'pointer', width: '100%' }}>
      <span className="muted" style={{ width: 20 }}>{rank}</span>
      <CoverArt url={album.cover} fallbackLetter={album.artist[0] || '?'} className="cov" style={{ width: 40, height: 40 }} />
      <div className="g"><b>{album.title}</b><div className="muted">{album.artist} · {album.year}</div></div>
    </button>
  );
}
