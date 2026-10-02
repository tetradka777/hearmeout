'use client';

import { useEffect, useState } from 'react';
import { useApp } from '@/lib/AppContext';
import type { OnThisDayGroup } from '@/app/api/on-this-day/route';

// Free for everyone now (premium removed from the product).
export function OnThisDayTeaser() {
  const { me, t, openAlbum } = useApp();
  const [data, setData] = useState<OnThisDayGroup[] | null>(null);

  useEffect(() => {
    if (!me) return;
    let cancelled = false;
    fetch('/api/on-this-day').then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (!cancelled && d) setData(d.groups);
    });
    return () => { cancelled = true; };
  }, [me]);

  if (!me || !data || !data.length) return null;
  const top = data[0];
  const track = top.tracks[0];
  if (!track) return null;

  return (
    <button className="tile s3" style={{ textAlign: 'left', width: '100%', cursor: track.albumId ? 'pointer' : 'default' }} onClick={() => track.albumId && openAlbum(track.albumId)}>
      <div className="eyebrow">{t('onThisDay.title')}</div>
      <h3>{track.title}</h3>
      <p className="muted">{track.artist} · {top.year}</p>
    </button>
  );
}
