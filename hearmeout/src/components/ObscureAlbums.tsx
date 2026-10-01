'use client';

import { useApp } from '@/lib/AppContext';
import { CoverArt } from './ui/CoverArt';

export function ObscureAlbums({ genre, rowClass }: { genre: string; rowClass: string }) {
  const { t, spotifyObscure, openAlbum } = useApp();
  const albums = spotifyObscure[genre];

  if (albums === 'error') return <p className="muted">{t('generic.loadError')}</p>;
  if (!albums) return <p className="muted">{t('obscure.loading')}</p>;
  if (!albums.length) return <p className="muted">{t('obscure.empty')}</p>;

  return (
    <div className={rowClass}>
      {albums.map((a) => (
        <button className="cvw" key={a.id} onClick={() => openAlbum(a.id)} style={{ textAlign: 'left', width: '100%' }}>
          <CoverArt url={a.cover ?? undefined} fallbackLetter={a.artist[0] || '?'} className="cov" style={{ width: '100%', aspectRatio: '1' }} />
          <div style={{ marginTop: 8 }}><b>{a.title}</b><div className="muted">{a.artist}</div></div>
        </button>
      ))}
    </div>
  );
}
