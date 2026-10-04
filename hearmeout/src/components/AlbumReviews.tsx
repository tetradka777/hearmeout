'use client';

import { useEffect, useState } from 'react';
import { useApp } from '@/lib/AppContext';
import { userAvatarStyle, formatRelative } from '@/lib/format';
import type { AlbumReview } from '@/lib/types';
import { Stars } from './redesign/Stars';

type ReviewWithTime = AlbumReview & { createdAt: string };

export function AlbumReviews({ albumId, refreshToken }: { albumId: string; refreshToken: number }) {
  const { t, language } = useApp();
  const [reviews, setReviews] = useState<ReviewWithTime[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setReviews(null);
    // Server-side: skips private ratings and respects "Public reviews".
    fetch(`/api/albums/${encodeURIComponent(albumId)}/reviews`)
      .then((r) => (r.ok ? r.json() : { reviews: [] }))
      .then((d: { reviews: ReviewWithTime[] }) => { if (!cancelled) setReviews(d.reviews); })
      .catch(() => { if (!cancelled) setReviews([]); });
    return () => { cancelled = true; };
  }, [albumId, refreshToken]);

  if (reviews === null) return <div className="muted">{t('reviews.loading')}</div>;
  if (!reviews.length) return <div className="tile empty"><p>{t('reviews.empty')}</p></div>;

  return (
    <div className="stack">
      {reviews.map((r, i) => (
        <div className="tile t-soft2" key={i}>
          <div className="ft top" style={{ marginBottom: 10 }}>
            <div className="dot" style={userAvatarStyle(r.user)}>{r.user.name[0]}</div>
            <div className="who"><b>{r.user.handle}</b></div>
            <Stars value={r.stars} size={14} />
            <small className="muted" style={{ marginLeft: 'auto' }}>{formatRelative(r.createdAt, language)}</small>
          </div>
          <p className="quote">&ldquo;{r.review}&rdquo;</p>
        </div>
      ))}
    </div>
  );
}
