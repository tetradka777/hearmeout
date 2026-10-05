'use client';

import { useEffect, useState } from 'react';
import { useApp } from '@/lib/AppContext';
import { userAvatarStyle, formatRelative } from '@/lib/format';
import type { AlbumReview } from '@/lib/types';

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
  if (!reviews.length) return <p className="muted">{t('reviews.empty')}</p>;

  // vRate() Reviews tile: avatar, "name · date", the quote at 17px and the
  // score as a 30px accent number on the right.
  return (
    <>
      {reviews.map((r, i) => (
        <div className="row" style={{ alignItems: 'flex-start' }} key={i}>
          <div className="dot" style={userAvatarStyle(r.user)}>{!r.user.avatarUrl && r.user.name[0]}</div>
          <span className="g">
            <b>{r.user.name} <small className="muted" style={{ fontWeight: 700 }}>· {formatRelative(r.createdAt, language)}</small></b>
            <span className="quote" style={{ fontSize: 17, display: 'block', marginTop: 4 }}>&ldquo;{r.review}&rdquo;</span>
          </span>
          <span className="num" style={{ fontSize: 30, color: 'var(--acct)' }}>{r.stars.toFixed(1)}</span>
        </div>
      ))}
    </>
  );
}
