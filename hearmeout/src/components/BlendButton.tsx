'use client';

import { useEffect, useRef } from 'react';
import { useApp } from '@/lib/AppContext';
import { drawBlendPoster } from '@/lib/posterCanvas';

export function BlendButton({ me, friend, friendName, matchPct, className = 'btn ghost' }: { me: string; friend: string; friendName: string; matchPct: number | null; className?: string }) {
  const { t, ensureRecap, recapCache } = useApp();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    ensureRecap('me', 'month');
    ensureRecap(friend, 'month');
  }, [friend, ensureRecap]);

  const dataA = recapCache[`${me}:month`];
  const dataB = recapCache[`${friend}:month`];
  if (!dataA || !dataB) return null;

  const download = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawBlendPoster(canvas, dataA, t('friend.you'), dataB, friendName, matchPct);
    const url = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.href = url;
    link.download = 'hearmeout-blend.png';
    link.click();
  };

  return (
    <>
      <button className={className} onClick={download}>{t('friend.downloadBlend')}</button>
      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </>
  );
}
